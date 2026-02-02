package database

import (
	"encoding/json"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// ExplainQuery runs explain on a query and returns the execution plan.
func (s *Service) ExplainQuery(connID, dbName, collName, filter string) (*types.ExplainResult, error) {
	if err := ValidateDatabaseAndCollection(dbName, collName); err != nil {
		return nil, err
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	// Parse filter
	var filterDoc bson.M
	if filter == "" || filter == "{}" {
		filterDoc = bson.M{}
	} else {
		if err := bson.UnmarshalExtJSON([]byte(filter), true, &filterDoc); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}

	db := client.Database(dbName)

	// Run explain command with executionStats verbosity
	explainCmd := bson.D{
		{Key: "explain", Value: bson.D{
			{Key: "find", Value: collName},
			{Key: "filter", Value: filterDoc},
		}},
		{Key: "verbosity", Value: "executionStats"},
	}

	var explainResult bson.M
	err = db.RunCommand(ctx, explainCmd).Decode(&explainResult)
	if err != nil {
		return nil, fmt.Errorf("failed to run explain: %w", err)
	}

	// Marshal the full result for rawExplain
	rawBytes, _ := json.MarshalIndent(explainResult, "", "  ")

	result := &types.ExplainResult{
		RawExplain: string(rawBytes),
	}

	// Parse queryPlanner
	if qp, ok := explainResult["queryPlanner"].(bson.M); ok {
		if ns, ok := qp["namespace"].(string); ok {
			result.QueryPlanner.Namespace = ns
		}
		if ifs, ok := qp["indexFilterSet"].(bool); ok {
			result.QueryPlanner.IndexFilterSet = ifs
		}
		if pq, ok := qp["parsedQuery"].(bson.M); ok {
			pqBytes, _ := json.Marshal(pq)
			result.QueryPlanner.ParsedQuery = string(pqBytes)
		}
		if rp, ok := qp["rejectedPlans"].(bson.A); ok {
			result.QueryPlanner.RejectedPlans = len(rp)
		}

		// Parse winning plan
		if wp, ok := qp["winningPlan"].(bson.M); ok {
			result.WinningPlan = extractPlanSummary(wp)
			result.QueryPlanner.WinningPlanStage = extractTopStage(wp)
			result.IndexUsed = extractIndexName(wp)
			result.IsCollectionScan = isCollectionScan(wp)
		}
	}

	// Parse executionStats
	if es, ok := explainResult["executionStats"].(bson.M); ok {
		result.ExecutionStats.ExecutionSuccess = getBoolValue(es, "executionSuccess")
		result.ExecutionStats.NReturned = getInt64Value(es, "nReturned")
		result.ExecutionStats.ExecutionTimeMs = getInt64Value(es, "executionTimeMillis")
		result.ExecutionStats.TotalKeysExamined = getInt64Value(es, "totalKeysExamined")
		result.ExecutionStats.TotalDocsExamined = getInt64Value(es, "totalDocsExamined")
	}

	return result, nil
}

// extractPlanSummary creates a human-readable summary of the query plan.
func extractPlanSummary(plan bson.M) string {
	stage, _ := plan["stage"].(string)

	switch stage {
	case "COLLSCAN":
		return "Collection Scan (no index used)"
	case "IXSCAN":
		indexName, _ := plan["indexName"].(string)
		return fmt.Sprintf("Index Scan using '%s'", indexName)
	case "FETCH":
		if inputStage, ok := plan["inputStage"].(bson.M); ok {
			innerSummary := extractPlanSummary(inputStage)
			return fmt.Sprintf("Fetch -> %s", innerSummary)
		}
		return "Fetch"
	case "IDHACK":
		return "ID Lookup (fast path)"
	case "SORT":
		if inputStage, ok := plan["inputStage"].(bson.M); ok {
			innerSummary := extractPlanSummary(inputStage)
			return fmt.Sprintf("Sort -> %s", innerSummary)
		}
		return "Sort"
	case "LIMIT":
		if inputStage, ok := plan["inputStage"].(bson.M); ok {
			innerSummary := extractPlanSummary(inputStage)
			return fmt.Sprintf("Limit -> %s", innerSummary)
		}
		return "Limit"
	case "SKIP":
		if inputStage, ok := plan["inputStage"].(bson.M); ok {
			innerSummary := extractPlanSummary(inputStage)
			return fmt.Sprintf("Skip -> %s", innerSummary)
		}
		return "Skip"
	case "PROJECTION_COVERED":
		if inputStage, ok := plan["inputStage"].(bson.M); ok {
			innerSummary := extractPlanSummary(inputStage)
			return fmt.Sprintf("Covered Projection -> %s", innerSummary)
		}
		return "Covered Projection"
	case "PROJECTION_SIMPLE", "PROJECTION_DEFAULT":
		if inputStage, ok := plan["inputStage"].(bson.M); ok {
			innerSummary := extractPlanSummary(inputStage)
			return fmt.Sprintf("Projection -> %s", innerSummary)
		}
		return "Projection"
	default:
		if stage != "" {
			return stage
		}
		return "Unknown"
	}
}

// extractTopStage gets the top-level stage name.
func extractTopStage(plan bson.M) string {
	stage, _ := plan["stage"].(string)
	return stage
}

// extractIndexName finds the index name used in the plan.
func extractIndexName(plan bson.M) string {
	stage, _ := plan["stage"].(string)

	if stage == "IXSCAN" {
		if name, ok := plan["indexName"].(string); ok {
			return name
		}
	}

	// Check input stages recursively
	if inputStage, ok := plan["inputStage"].(bson.M); ok {
		return extractIndexName(inputStage)
	}

	return ""
}

// isCollectionScan checks if the plan uses a collection scan.
func isCollectionScan(plan bson.M) bool {
	stage, _ := plan["stage"].(string)

	if stage == "COLLSCAN" {
		return true
	}

	// Check input stages recursively
	if inputStage, ok := plan["inputStage"].(bson.M); ok {
		return isCollectionScan(inputStage)
	}

	return false
}

// getInt64Value extracts an int64 value from a bson.M.
func getInt64Value(m bson.M, key string) int64 {
	switch v := m[key].(type) {
	case int32:
		return int64(v)
	case int64:
		return v
	case float64:
		return int64(v)
	default:
		return 0
	}
}

// getBoolValue extracts a bool value from a bson.M.
func getBoolValue(m bson.M, key string) bool {
	if v, ok := m[key].(bool); ok {
		return v
	}
	return false
}
