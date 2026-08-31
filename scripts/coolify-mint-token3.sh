#!/usr/bin/env bash
set -euo pipefail
docker exec coolify php artisan tinker --execute='$user = \App\Models\User::query()->where("id", 0)->first() ?? \App\Models\User::query()->orderBy("id")->first(); if (!$user) { echo "NO_USER\n"; return; } $teamId = \DB::table("team_user")->where("user_id", $user->id)->value("team_id") ?? 0; $token = $user->createToken("abbyglow-provision", ["*"]); \DB::table("personal_access_tokens")->where("id", $token->accessToken->id)->update(["team_id" => $teamId]); echo $token->plainTextToken, "\n";'
