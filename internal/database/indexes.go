package database

import (
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// ListIndexes returns all indexes for a collection with stats.
func (s *Service) ListIndexes(connID, dbName, collName string) ([]types.IndexInfo, error) {
	if err := ValidateDatabaseAndCollection(dbName, collName); err != nil {
		return nil, err
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	cursor, err := coll.Indexes().List(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list indexes: %w", err)
	}
	defer cursor.Close(ctx)

	// Get index stats for usage counts
	indexStats := make(map[string]int64)
	statsCmd := bson.D{{Key: "aggregate", Value: collName}, {Key: "pipeline", Value: bson.A{bson.D{{Key: "$indexStats", Value: bson.D{}}}}}, {Key: "cursor", Value: bson.D{}}}
	var statsResult bson.M
	if err := client.Database(dbName).RunCommand(ctx, statsCmd).Decode(&statsResult); err == nil {
		if cursorDoc, ok := statsResult["cursor"].(bson.M); ok {
			if firstBatch, ok := cursorDoc["firstBatch"].(bson.A); ok {
				for _, item := range firstBatch {
					if doc, ok := item.(bson.M); ok {
						name, _ := doc["name"].(string)
						if accesses, ok := doc["accesses"].(bson.M); ok {
							if ops, ok := accesses["ops"].(int64); ok {
								indexStats[name] = ops
							} else if ops32, ok := accesses["ops"].(int32); ok {
								indexStats[name] = int64(ops32)
							}
						}
					}
				}
			}
		}
	}

	// Get collection stats for index sizes
	indexSizes := make(map[string]int64)
	var collStats bson.M
	if err := client.Database(dbName).RunCommand(ctx, bson.D{{Key: "collStats", Value: collName}}).Decode(&collStats); err == nil {
		if sizes, ok := collStats["indexSizes"].(bson.M); ok {
			for name, size := range sizes {
				switch v := size.(type) {
				case int64:
					indexSizes[name] = v
				case int32:
					indexSizes[name] = int64(v)
				case float64:
					indexSizes[name] = int64(v)
				}
			}
		}
	}

	var indexes []types.IndexInfo
	for cursor.Next(ctx) {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			continue
		}

		name, _ := result["name"].(string)
		unique, _ := result["unique"].(bool)
		sparse, _ := result["sparse"].(bool)

		// Parse TTL
		var ttl int64
		if expireAfter, ok := result["expireAfterSeconds"].(int32); ok {
			ttl = int64(expireAfter)
		} else if expireAfter, ok := result["expireAfterSeconds"].(int64); ok {
			ttl = expireAfter
		}

		keys := make(map[string]int)
		if keyDoc, ok := result["key"].(bson.M); ok {
			for k, v := range keyDoc {
				switch val := v.(type) {
				case int32:
					keys[k] = int(val)
				case int64:
					keys[k] = int(val)
				case float64:
					keys[k] = int(val)
				case string:
					// Text indexes have "text" as value
					if val == "text" {
						keys[k] = 0 // Use 0 to indicate text index
					}
				}
			}
		}

		indexes = append(indexes, types.IndexInfo{
			Name:       name,
			Keys:       keys,
			Unique:     unique,
			Sparse:     sparse,
			TTL:        ttl,
			Size:       indexSizes[name],
			UsageCount: indexStats[name],
		})
	}

	return indexes, nil
}

// CreateIndex creates a new index on a collection.
func (s *Service) CreateIndex(connID, dbName, collName string, keys map[string]int, opts types.IndexOptions) error {
	if err := ValidateDatabaseAndCollection(dbName, collName); err != nil {
		return err
	}

	if len(keys) == 0 {
		return fmt.Errorf("index keys cannot be empty")
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)

	// Build the index keys document
	keysDoc := bson.D{}
	for field, order := range keys {
		keysDoc = append(keysDoc, bson.E{Key: field, Value: order})
	}

	// Build index options
	indexOpts := options.Index()
	if opts.Unique {
		indexOpts.SetUnique(true)
	}
	if opts.Sparse {
		indexOpts.SetSparse(true)
	}
	if opts.ExpireAfterSeconds > 0 {
		indexOpts.SetExpireAfterSeconds(int32(opts.ExpireAfterSeconds))
	}
	if opts.Name != "" {
		indexOpts.SetName(opts.Name)
	}

	indexModel := mongo.IndexModel{
		Keys:    keysDoc,
		Options: indexOpts,
	}

	_, err = coll.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		return fmt.Errorf("failed to create index: %w", err)
	}

	return nil
}

// DropIndex drops an index from a collection.
func (s *Service) DropIndex(connID, dbName, collName, indexName string) error {
	if err := ValidateDatabaseAndCollection(dbName, collName); err != nil {
		return err
	}

	if indexName == "" {
		return fmt.Errorf("index name cannot be empty")
	}

	if indexName == "_id_" {
		return fmt.Errorf("cannot drop the default _id index")
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	_, err = coll.Indexes().DropOne(ctx, indexName)
	if err != nil {
		return fmt.Errorf("failed to drop index: %w", err)
	}

	return nil
}
