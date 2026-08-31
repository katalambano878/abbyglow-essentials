#!/usr/bin/env bash
set -euo pipefail
docker exec coolify php artisan tinker --execute='
$plain = \Illuminate\Support\Str::random(40);
$hash = hash("sha256", $plain);
$id = \DB::table("personal_access_tokens")->insertGetId([
  "tokenable_type" => "App\\Models\\User",
  "tokenable_id" => 0,
  "name" => "abbyglow-provision",
  "token" => $hash,
  "abilities" => json_encode(["*"]),
  "team_id" => 0,
  "created_at" => now(),
  "updated_at" => now(),
]);
echo $id . "|" . $plain . "\n";
'
