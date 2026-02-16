package database

import (
	"fmt"
	"sort"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/peternagy/mongopal/internal/bsonutil"
	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// profileSampleSize is the number of documents to sample for field analysis.
const profileSampleSize = 5

// GetCollectionProfile returns a lightweight profile of a collection for
// pre-query health checks. It combines collStats metadata with a quick
// schema sample to determine field count, nesting depth, etc.
func (s *Service) GetCollectionProfile(connID, dbName, collName string) (*types.CollectionProfile, error) {
	if err := ValidateDatabaseAndCollection(dbName, collName); err != nil {
		return nil, err
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	db := client.Database(dbName)
	profile := &types.CollectionProfile{}

	// 1. Get collection stats (fast metadata, no scan)
	var statsResult bson.M
	err = db.RunCommand(ctx, bson.D{{Key: "collStats", Value: collName}}).Decode(&statsResult)
	if err != nil {
		return nil, fmt.Errorf("failed to get collection stats: %w", err)
	}

	profile.AvgDocSizeBytes = bsonutil.ToInt64(statsResult["avgObjSize"])
	profile.DocCount = bsonutil.ToInt64(statsResult["count"])

	// 2. Quick schema sample for field count and nesting depth
	if profile.DocCount > 0 {
		coll := db.Collection(collName)
		cursor, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(profileSampleSize))
		if err != nil {
			// Non-fatal: return partial profile with stats only
			return profile, nil
		}
		defer cursor.Close(ctx)

		topLevelFields := make(map[string]bool)
		allPaths := make(map[string]bool)
		maxDepth := 0

		for cursor.Next(ctx) {
			var doc bson.M
			if err := cursor.Decode(&doc); err != nil {
				continue
			}
			for key := range doc {
				topLevelFields[key] = true
			}
			walkFields("", doc, allPaths, 0, &maxDepth)
		}

		profile.FieldCount = len(topLevelFields)
		profile.TotalFieldPaths = len(allPaths)
		profile.MaxNestingDepth = maxDepth

		// Collect top-level field names (sorted) for frontend auto-projection
		fields := make([]string, 0, len(topLevelFields))
		for f := range topLevelFields {
			fields = append(fields, f)
		}
		sort.Strings(fields)
		profile.TopFields = fields
	}

	return profile, nil
}

// walkFields recursively walks document fields to count paths and measure depth.
func walkFields(prefix string, doc bson.M, paths map[string]bool, depth int, maxDepth *int) {
	if depth > *maxDepth {
		*maxDepth = depth
	}
	// Safety: don't recurse beyond 20 levels
	if depth > 20 {
		return
	}
	for key, value := range doc {
		fullPath := key
		if prefix != "" {
			fullPath = prefix + "." + key
		}
		paths[fullPath] = true

		switch v := value.(type) {
		case bson.M:
			walkFields(fullPath, v, paths, depth+1, maxDepth)
		case bson.A:
			if len(v) > 0 {
				if elem, ok := v[0].(bson.M); ok {
					walkFields(fullPath+"[]", elem, paths, depth+1, maxDepth)
				}
			}
		}
	}
}

