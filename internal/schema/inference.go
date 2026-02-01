// Package schema handles MongoDB collection schema inference.
package schema

import (
	"fmt"
	"sort"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// Service handles schema inference operations.
type Service struct {
	state *core.AppState
}

// NewService creates a new schema service.
func NewService(state *core.AppState) *Service {
	return &Service{state: state}
}

// InferCollectionSchema analyzes a collection and returns its inferred schema.
func (s *Service) InferCollectionSchema(connID, dbName, collName string, sampleSize int) (*types.SchemaResult, error) {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)

	// Count total documents
	total, err := coll.CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("failed to count documents: %w", err)
	}

	if total == 0 {
		return &types.SchemaResult{
			Collection: collName,
			SampleSize: 0,
			TotalDocs:  0,
			Fields:     make(map[string]types.SchemaField),
		}, nil
	}

	// Default sample size
	if sampleSize <= 0 {
		sampleSize = 10
	}

	// Calculate interval for even sampling
	interval := total / int64(sampleSize)
	if interval < 1 {
		interval = 1
	}

	// Collect samples by skipping at regular intervals
	var samples []bson.M
	actualSamples := 0
	for i := int64(0); i < total && actualSamples < sampleSize; i += interval {
		findOpts := options.FindOne().SetSkip(i)
		var doc bson.M
		if err := coll.FindOne(ctx, bson.M{}, findOpts).Decode(&doc); err != nil {
			continue
		}
		samples = append(samples, doc)
		actualSamples++
	}

	// Analyze schema from samples
	fieldCounts := make(map[string]int)
	fieldTypes := make(map[string]map[string]bool) // field -> set of types
	fieldSchemas := make(map[string][]bson.M)      // for nested analysis

	for _, doc := range samples {
		analyzeDocument("", doc, fieldCounts, fieldTypes, fieldSchemas)
	}

	// Build schema result
	schema := buildSchemaFields(fieldCounts, fieldTypes, fieldSchemas, len(samples))

	return &types.SchemaResult{
		Collection: collName,
		SampleSize: len(samples),
		TotalDocs:  total,
		Fields:     schema,
	}, nil
}

// analyzeDocument recursively analyzes a document's structure.
func analyzeDocument(prefix string, doc bson.M, counts map[string]int, types map[string]map[string]bool, nested map[string][]bson.M) {
	for key, value := range doc {
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}

		counts[fullKey]++

		if types[fullKey] == nil {
			types[fullKey] = make(map[string]bool)
		}

		typeName := getBsonTypeName(value)
		types[fullKey][typeName] = true

		// Recurse into nested documents
		if nestedDoc, ok := value.(bson.M); ok {
			if nested[fullKey] == nil {
				nested[fullKey] = []bson.M{}
			}
			nested[fullKey] = append(nested[fullKey], nestedDoc)
			analyzeDocument(fullKey, nestedDoc, counts, types, nested)
		}

		// Analyze array elements
		if arr, ok := value.(bson.A); ok && len(arr) > 0 {
			// Sample first element to determine array type
			if elem, ok := arr[0].(bson.M); ok {
				arrayKey := fullKey + "[]"
				if nested[arrayKey] == nil {
					nested[arrayKey] = []bson.M{}
				}
				nested[arrayKey] = append(nested[arrayKey], elem)
				analyzeDocument(arrayKey, elem, counts, types, nested)
			}
		}
	}
}

// getBsonTypeName returns a human-readable type name for a BSON value.
func getBsonTypeName(value interface{}) string {
	if value == nil {
		return "Null"
	}

	switch v := value.(type) {
	case primitive.ObjectID:
		return "ObjectId"
	case string:
		return "String"
	case int32:
		return "Int32"
	case int64:
		return "Int64"
	case float64:
		return "Double"
	case bool:
		return "Boolean"
	case primitive.DateTime:
		return "Date"
	case primitive.Timestamp:
		return "Timestamp"
	case bson.M:
		return "Object"
	case bson.A:
		if len(v) > 0 {
			elemType := getBsonTypeName(v[0])
			return "Array<" + elemType + ">"
		}
		return "Array"
	case primitive.Binary:
		return "Binary"
	case primitive.Decimal128:
		return "Decimal128"
	case primitive.Regex:
		return "Regex"
	default:
		return fmt.Sprintf("%T", value)
	}
}

// buildSchemaFields constructs the schema field map from analysis results.
func buildSchemaFields(counts map[string]int, fieldTypes map[string]map[string]bool, nested map[string][]bson.M, totalSamples int) map[string]types.SchemaField {
	result := make(map[string]types.SchemaField)

	// Only include top-level fields (no dots in key)
	for key, count := range counts {
		if strings.Contains(key, ".") {
			continue // Skip nested fields, they'll be handled recursively
		}

		typeList := []string{}
		for t := range fieldTypes[key] {
			typeList = append(typeList, t)
		}
		sort.Strings(typeList)

		typeName := strings.Join(typeList, " | ")
		occurrence := float64(count) / float64(totalSamples) * 100

		field := types.SchemaField{
			Type:       typeName,
			Occurrence: occurrence,
		}

		// Check for nested object fields
		if nestedDocs, ok := nested[key]; ok && len(nestedDocs) > 0 {
			nestedCounts := make(map[string]int)
			nestedTypes := make(map[string]map[string]bool)
			nestedNested := make(map[string][]bson.M)

			for _, doc := range nestedDocs {
				analyzeDocument("", doc, nestedCounts, nestedTypes, nestedNested)
			}

			field.Fields = buildSchemaFields(nestedCounts, nestedTypes, nestedNested, len(nestedDocs))
		}

		// Check for array element schema
		arrayKey := key + "[]"
		if nestedDocs, ok := nested[arrayKey]; ok && len(nestedDocs) > 0 {
			nestedCounts := make(map[string]int)
			nestedTypes := make(map[string]map[string]bool)
			nestedNested := make(map[string][]bson.M)

			for _, doc := range nestedDocs {
				analyzeDocument("", doc, nestedCounts, nestedTypes, nestedNested)
			}

			arraySchema := buildSchemaFields(nestedCounts, nestedTypes, nestedNested, len(nestedDocs))
			if len(arraySchema) > 0 {
				field.ArrayType = &types.SchemaField{
					Type:   "Object",
					Fields: arraySchema,
				}
			}
		}

		result[key] = field
	}

	return result
}
