package document

import (
	"encoding/json"
	"fmt"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ParseDocumentID converts a document ID string to the appropriate BSON type.
// Accepts: Extended JSON, ObjectID hex string, or plain string.
func ParseDocumentID(docID string) interface{} {
	// Try to parse as Extended JSON first (handles Binary, UUID, ObjectId, $numberLong, etc.)
	if strings.HasPrefix(docID, "{") {
		// Wrap in a document to properly parse Extended JSON types like $numberLong
		// bson.UnmarshalExtJSON into interface{} doesn't convert EJSON types, but bson.M does
		wrapped := fmt.Sprintf(`{"_id": %s}`, docID)
		var doc bson.M
		if err := bson.UnmarshalExtJSON([]byte(wrapped), true, &doc); err == nil {
			return doc["_id"]
		}
	}

	// Try to parse as ObjectID hex
	if oid, err := primitive.ObjectIDFromHex(docID); err == nil {
		return oid
	}

	// Fall back to plain string
	return docID
}

// ValidateJSON validates JSON/Extended JSON syntax.
func ValidateJSON(jsonStr string) error {
	var doc bson.M
	if err := bson.UnmarshalExtJSON([]byte(jsonStr), true, &doc); err != nil {
		// Try standard JSON
		if err2 := json.Unmarshal([]byte(jsonStr), &doc); err2 != nil {
			return fmt.Errorf("invalid JSON: %w", err)
		}
	}
	return nil
}
