#!/usr/bin/env bash
# Create Kafka topics on local Redpanda (idempotent).
set -euo pipefail

BROKER="${KAFKA_BOOTSTRAP_SERVERS:-localhost:19092}"

topics=(
  reclaimai.order.created.v1
  reclaimai.identity.unmasked.v1
  reclaimai.offer.ready.v1
  reclaimai.message.generated.v1
  reclaimai.whatsapp.delivered.v1
  reclaimai.direct_order.completed.v1
)

for topic in "${topics[@]}"; do
  docker exec reclaimai-redpanda rpk topic create "$topic" -p 3 -r 1 --brokers "$BROKER" || true
  echo "ensured topic: $topic"
done
