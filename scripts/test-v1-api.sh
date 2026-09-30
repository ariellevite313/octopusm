#!/usr/bin/env bash
# test-v1-api.sh — Tests de l'API v1 Aido
# Usage: BASE_URL=https://omdot.fun bash scripts/test-v1-api.sh
# Pour tester en local: BASE_URL=http://localhost:3000 bash scripts/test-v1-api.sh

BASE_URL="${BASE_URL:-https://omdot.fun}"
API="$BASE_URL/api/v1"

PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $1\033[0m"; }
red()   { echo -e "\033[31m✗ $1\033[0m"; }

check() {
  local label="$1"
  local expected_status="$2"
  local url="$3"
  local jq_check="$4"   # optional jq expression that must be "true"

  resp=$(curl -s -w "\n%{http_code}" "$url")
  status=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)

  if [ "$status" != "$expected_status" ]; then
    red "$label — expected HTTP $expected_status, got $status"
    echo "   body: $(echo "$body" | head -c 200)"
    FAIL=$((FAIL+1))
    return
  fi

  if [ -n "$jq_check" ]; then
    result=$(echo "$body" | jq -r "$jq_check" 2>/dev/null)
    if [ "$result" != "true" ]; then
      red "$label — jq check failed: $jq_check → $result"
      echo "   body: $(echo "$body" | head -c 300)"
      FAIL=$((FAIL+1))
      return
    fi
  fi

  green "$label"
  PASS=$((PASS+1))
}

echo ""
echo "=== omdot.fun API v1 tests ==="
echo "Base: $API"
echo ""

# ── /health ──────────────────────────────────────────────────────────────────
check "GET /health → 200 ok=true" \
  "200" "$API/health" \
  '.ok == true'

# ── Valid address (treasury, may have 0 tokens — returns 200 either way) ─────
ADDR1="0xf1173b875829293F7f02C20f177242a556f302fA"

check "GET /summary valid address → 200" \
  "200" "$API/creators/$ADDR1/summary" \
  '.address != null'

check "GET /summary — address field is lowercase" \
  "200" "$API/creators/$ADDR1/summary" \
  '(.address | ascii_downcase) == .address'

check "GET /summary — earned_total_usdc is a string" \
  "200" "$API/creators/$ADDR1/summary" \
  '(.earned_total_usdc | type) == "string"'

check "GET /summary — tokens is a number" \
  "200" "$API/creators/$ADDR1/summary" \
  '(.tokens | type) == "number"'

check "GET /tokens valid address → 200 array" \
  "200" "$API/creators/$ADDR1/tokens" \
  '. | type == "array"'

check "GET /claims valid address → 200 items array" \
  "200" "$API/creators/$ADDR1/claims?limit=5" \
  '.items | type == "array"'

check "GET /claims — next_cursor is string or null" \
  "200" "$API/creators/$ADDR1/claims?limit=5" \
  '(.next_cursor | type) == "string" or (.next_cursor | type) == "null"'

# ── Unknown address → 200 with zeros (not 404) ───────────────────────────────
UNKNOWN="0x0000000000000000000000000000000000000001"

check "GET /summary unknown address → 200 (not 404)" \
  "200" "$API/creators/$UNKNOWN/summary" \
  '.tokens == 0'

check "GET /summary unknown → earned_total_usdc is 0" \
  "200" "$API/creators/$UNKNOWN/summary" \
  '.earned_total_usdc == "0.000000"'

check "GET /tokens unknown address → 200 empty array" \
  "200" "$API/creators/$UNKNOWN/tokens" \
  '. == []'

check "GET /claims unknown address → 200 empty items" \
  "200" "$API/creators/$UNKNOWN/claims" \
  '.items == []'

# ── Invalid address → 400 ────────────────────────────────────────────────────
check "GET /summary invalid address → 400" \
  "400" "$API/creators/not-an-address/summary" \
  '.error != null'

check "GET /tokens invalid address → 400" \
  "400" "$API/creators/0xSHORT/tokens" \
  '.error != null'

check "GET /claims invalid address → 400" \
  "400" "$API/creators/0xinvalid/claims" \
  '.error != null'

# ── /claim-info missing token param → 400 ────────────────────────────────────
check "GET /claim-info missing ?token → 400" \
  "400" "$API/creators/$ADDR1/claim-info" \
  '.error != null'

check "GET /claim-info invalid ?token → 400" \
  "400" "$API/creators/$ADDR1/claim-info?token=badaddr" \
  '.error != null'

# ── CORS headers ─────────────────────────────────────────────────────────────
cors_header=$(curl -s -I "$API/health" | grep -i "access-control-allow-origin" | tr -d '\r')
if echo "$cors_header" | grep -q "\*"; then
  green "CORS header present (*)"
  PASS=$((PASS+1))
else
  red "CORS header missing or wrong: $cors_header"
  FAIL=$((FAIL+1))
fi

# ── Response time < 2s ───────────────────────────────────────────────────────
time_ms=$(curl -s -o /dev/null -w "%{time_total}" "$API/health" | awk '{printf "%d", $1*1000}')
if [ "$time_ms" -lt 2000 ]; then
  green "Response time ${time_ms}ms < 2000ms"
  PASS=$((PASS+1))
else
  red "Response time ${time_ms}ms ≥ 2000ms (target < 500ms)"
  FAIL=$((FAIL+1))
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
