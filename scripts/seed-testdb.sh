#!/usr/bin/env bash
set -euo pipefail

# seed-testdb.sh — Spin up a local MongoDB and fill it with generated test data.
# All data is code-generated inside mongosh, so nothing bloats the repo.
#
# Usage:
#   ./scripts/seed-testdb.sh          # start container + seed
#   ./scripts/seed-testdb.sh --seed   # re-seed existing container (drops & recreates)
#   ./scripts/seed-testdb.sh --stop   # stop and remove container
#   ./scripts/seed-testdb.sh --uri    # print connection URI only
#
# Requires: docker

CONTAINER_NAME="mongopal-testdb"
MONGO_IMAGE="mongo:7"
HOST_PORT="${MONGOPAL_TEST_PORT:-27099}"
DB_NAME="test_largedocs"
URI="mongodb://localhost:${HOST_PORT}"

# --- helpers ----------------------------------------------------------------

info()  { printf "\033[0;36m→ %s\033[0m\n" "$*"; }
ok()    { printf "\033[0;32m✓ %s\033[0m\n" "$*"; }
warn()  { printf "\033[0;33m⚠ %s\033[0m\n" "$*"; }
die()   { printf "\033[0;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

ensure_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is required but not installed"
  docker info >/dev/null 2>&1 || die "docker daemon is not running"
}

container_running() {
  docker ps --filter "name=^${CONTAINER_NAME}$" --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"
}

container_exists() {
  docker ps -a --filter "name=^${CONTAINER_NAME}$" --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"
}

wait_for_mongo() {
  info "Waiting for MongoDB to accept connections..."
  for i in $(seq 1 30); do
    if docker exec "$CONTAINER_NAME" mongosh --quiet --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
      ok "MongoDB ready"
      return 0
    fi
    sleep 1
  done
  die "MongoDB did not become ready in 30s"
}

start_container() {
  if container_running; then
    ok "Container ${CONTAINER_NAME} already running on port ${HOST_PORT}"
    return 0
  fi

  if container_exists; then
    info "Starting stopped container ${CONTAINER_NAME}..."
    docker start "$CONTAINER_NAME" >/dev/null
  else
    info "Creating container ${CONTAINER_NAME} (${MONGO_IMAGE}, port ${HOST_PORT})..."
    docker run -d \
      --name "$CONTAINER_NAME" \
      -p "${HOST_PORT}:27017" \
      "$MONGO_IMAGE" >/dev/null
  fi

  wait_for_mongo
}

stop_container() {
  if container_running; then
    info "Stopping ${CONTAINER_NAME}..."
    docker stop "$CONTAINER_NAME" >/dev/null
  fi
  if container_exists; then
    info "Removing ${CONTAINER_NAME}..."
    docker rm "$CONTAINER_NAME" >/dev/null
  fi
  ok "Container removed"
}

# --- seed data (mongosh JS) -------------------------------------------------

seed_data() {
  info "Seeding database '${DB_NAME}'..."

  docker exec -i "$CONTAINER_NAME" mongosh --quiet "$DB_NAME" <<'MONGOSH'

// Drop previous data
db.dropDatabase();
print("Database dropped, seeding fresh data...");

// ============================================================
// 1. wide_documents — 200 fields per doc, 500 docs
//    Tests: LDH-02 (column cap), LDH-03 (auto-projection),
//           LDH-07 (column visibility dropdown)
// ============================================================
print("  → wide_documents (500 docs × 200 fields)");
{
  const bulk = db.wide_documents.initializeUnorderedBulkOp();
  for (let i = 0; i < 500; i++) {
    const doc = { index: i, name: `record_${i}`, createdAt: new Date() };
    for (let f = 0; f < 197; f++) {
      doc[`field_${String(f).padStart(3, '0')}`] = (f % 3 === 0) ? `val_${i}_${f}`
        : (f % 3 === 1) ? i * f
        : (f % 2 === 0);
    }
    bulk.insert(doc);
  }
  bulk.execute();
}

// ============================================================
// 2. deep_nested — 10-level nesting, 200 docs
//    Tests: LDH-06 (depth guard), column expansion
// ============================================================
print("  → deep_nested (200 docs × 10 levels)");
{
  function buildNested(depth, prefix) {
    if (depth <= 0) return `leaf_${prefix}`;
    return {
      value: `level_${depth}_${prefix}`,
      count: depth * 10,
      tags: [`tag_${depth}a`, `tag_${depth}b`],
      child: buildNested(depth - 1, `${prefix}_${depth}`)
    };
  }

  const bulk = db.deep_nested.initializeUnorderedBulkOp();
  for (let i = 0; i < 200; i++) {
    bulk.insert({
      index: i,
      name: `nested_${i}`,
      data: buildNested(10, String(i)),
      metadata: { source: "seed", batch: Math.floor(i / 50) }
    });
  }
  bulk.execute();
}

// ============================================================
// 3. large_arrays — docs with arrays of 500-2000 elements
//    Tests: LDH-06 (array display limit), response size
// ============================================================
print("  → large_arrays (100 docs × 500-2000 element arrays)");
{
  const bulk = db.large_arrays.initializeUnorderedBulkOp();
  for (let i = 0; i < 100; i++) {
    const arrLen = 500 + Math.floor(Math.random() * 1500);
    const items = [];
    for (let j = 0; j < arrLen; j++) {
      items.push({ id: j, label: `item_${j}`, score: Math.random() * 100 });
    }
    bulk.insert({
      index: i,
      name: `array_doc_${i}`,
      items: items,
      summary: { count: arrLen, avg_score: 50 }
    });
  }
  bulk.execute();
}

// ============================================================
// 4. big_strings — docs with 50KB-200KB string fields
//    Tests: LDH-04 (response size warning), LDH-05 (adaptive page),
//           LDH-06 (getRawValue size guard)
// ============================================================
print("  → big_strings (100 docs × 50KB-200KB string fields)");
{
  // Pre-build a 1KB block, then repeat — avoids mongosh string concat OOM
  const block = "The quick brown fox jumps over the lazy dog. 0123456789 ABCDEF\n";
  const kb = block.repeat(Math.ceil(1024 / block.length)).substring(0, 1024);

  for (let i = 0; i < 100; i++) {
    const sizeKB = 50 + (i % 150);  // 50KB to 199KB
    const body = kb.repeat(sizeKB);
    db.big_strings.insertOne({
      index: i,
      title: `big_doc_${i}`,
      body: body,
      sizeKB: sizeKB,
      created: new Date()
    });
    if ((i + 1) % 25 === 0) print(`    batch ${(i + 1) / 25}/4`);
  }
}

// ============================================================
// 5. many_documents — 50K docs (small), tests pagination/count
//    Tests: LDH-01 (collection profile), general pagination
// ============================================================
print("  → many_documents (50,000 small docs)");
{
  const batchSize = 5000;
  for (let batch = 0; batch < 10; batch++) {
    const bulk = db.many_documents.initializeUnorderedBulkOp();
    for (let i = 0; i < batchSize; i++) {
      const idx = batch * batchSize + i;
      bulk.insert({
        index: idx,
        category: ["alpha", "beta", "gamma", "delta"][idx % 4],
        value: Math.random() * 1000,
        active: idx % 3 !== 0,
        ts: new Date(Date.now() - idx * 60000)
      });
    }
    bulk.execute();
    print(`    batch ${batch + 1}/10`);
  }
}

// ============================================================
// 6. mixed_types — varied BSON types per field, 300 docs
//    Tests: schema inference, type display, Extended JSON
// ============================================================
print("  → mixed_types (300 docs with varied BSON types)");
{
  const bulk = db.mixed_types.initializeUnorderedBulkOp();
  for (let i = 0; i < 300; i++) {
    const doc = { index: i };

    // Alternate types for the same field names
    if (i % 5 === 0) {
      doc.payload = `string_${i}`;
      doc.count = NumberInt(i);
      doc.ref = ObjectId();
    } else if (i % 5 === 1) {
      doc.payload = i * 1.5;
      doc.count = NumberLong(i * 1000);
      doc.ref = `ref_${i}`;
    } else if (i % 5 === 2) {
      doc.payload = { nested: true, val: i };
      doc.count = null;
      doc.ref = new Date();
    } else if (i % 5 === 3) {
      doc.payload = [i, i + 1, i + 2];
      doc.count = NumberDecimal(String(i) + ".99");
      doc.ref = BinData(0, "c8edabc3");
    } else {
      doc.payload = i % 2 === 0;
      doc.count = NumberInt(i);
      doc.ref = /pattern_\d+/;
    }

    doc.tags = Array.from({ length: (i % 5) + 1 }, (_, j) => `tag_${j}`);
    doc.metadata = { source: "seed", variant: i % 5 };
    bulk.insert(doc);
  }
  bulk.execute();
}

// ============================================================
// 7. sparse_fields — only some docs have certain fields (20% fill)
//    Tests: LDH-03 (auto-projection by occurrence), schema analysis
// ============================================================
print("  → sparse_fields (1000 docs, 100 possible fields, ~20% fill rate)");
{
  const allFields = Array.from({ length: 100 }, (_, i) => `col_${String(i).padStart(3, '0')}`);
  const bulk = db.sparse_fields.initializeUnorderedBulkOp();
  for (let i = 0; i < 1000; i++) {
    const doc = { index: i, name: `sparse_${i}` };
    // Each doc gets ~20 random fields out of 100
    for (const field of allFields) {
      if (Math.random() < 0.2) {
        doc[field] = `val_${i}_${field}`;
      }
    }
    // First 5 fields always present (high-occurrence)
    for (let f = 0; f < 5; f++) {
      doc[`col_${String(f).padStart(3, '0')}`] = `always_${i}_${f}`;
    }
    bulk.insert(doc);
  }
  bulk.execute();
}

// ============================================================
// 8. normal_collection — regular well-structured data (control)
//    For comparison: no LDH warnings should trigger
// ============================================================
print("  → normal_collection (200 well-structured docs)");
{
  const statuses = ["active", "pending", "archived", "deleted"];
  const bulk = db.normal_collection.initializeUnorderedBulkOp();
  for (let i = 0; i < 200; i++) {
    bulk.insert({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
      status: statuses[i % 4],
      score: Math.round(Math.random() * 100),
      joined: new Date(Date.now() - i * 86400000),
      address: {
        street: `${100 + i} Main St`,
        city: ["NYC", "LA", "CHI", "HOU", "PHX"][i % 5],
        zip: String(10000 + i)
      }
    });
  }
  bulk.execute();
}

// ============================================================
// Summary
// ============================================================
print("\n--- Seed Summary ---");
const colls = db.getCollectionNames().sort();
for (const c of colls) {
  const stats = db[c].stats();
  const count = db[c].countDocuments();
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  print(`  ${c.padEnd(25)} ${String(count).padStart(7)} docs  ${sizeMB.padStart(8)} MB`);
}
print("\nDone! Connect with: mongodb://localhost:27099");

MONGOSH

  ok "Seeding complete"
  echo ""
  echo "  Database:  ${DB_NAME}"
  echo "  URI:       ${URI}"
  echo ""
  echo "  Connect in MongoPal using:"
  echo "    Host: localhost    Port: ${HOST_PORT}    DB: ${DB_NAME}"
  echo ""
}

# --- main -------------------------------------------------------------------

case "${1:-}" in
  --stop)
    ensure_docker
    stop_container
    ;;
  --seed)
    ensure_docker
    container_running || die "Container not running. Run without flags first."
    seed_data
    ;;
  --uri)
    echo "${URI}"
    ;;
  --help|-h)
    echo "Usage: $0 [--seed|--stop|--uri|--help]"
    echo ""
    echo "  (no flags)  Start container and seed data"
    echo "  --seed      Re-seed existing container (drops & recreates db)"
    echo "  --stop      Stop and remove container"
    echo "  --uri       Print connection URI"
    echo "  --help      Show this help"
    ;;
  *)
    ensure_docker
    start_container
    seed_data
    ;;
esac
