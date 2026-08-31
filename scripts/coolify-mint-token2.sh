#!/usr/bin/env bash
set -euo pipefail
echo "==> users"
docker exec coolify-db psql -U coolify -d coolify -c "SELECT id, name, email FROM users ORDER BY id LIMIT 10;"
echo "==> teams"
docker exec coolify-db psql -U coolify -d coolify -c "SELECT id, name FROM teams ORDER BY id LIMIT 10;"
echo "==> mint"
docker exec coolify php artisan tinker --execute="
\$users = \\App\\Models\\User::query()->get(['id','email','name']);
foreach (\$users as \$u) { echo \$u->id.' '.$u->email.PHP_EOL; }
\$user = \\App\\Models\\User::query()->where('id', '>', 0)->orderBy('id')->first();
if (!\$user) { echo 'NO_USER'; return; }
\$teamId = \\DB::table('team_user')->where('user_id', \$user->id)->value('team_id')
  ?? \\DB::table('teams')->orderBy('id')->value('id');
echo 'TEAM='.\$teamId.PHP_EOL;
\$token = \$user->createToken('abbyglow-provision', ['*']);
\\DB::table('personal_access_tokens')->where('id', \$token->accessToken->id)->update(['team_id' => \$teamId]);
echo \$token->plainTextToken.PHP_EOL;
"
