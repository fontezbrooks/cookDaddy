# Spoonacular batch fetch.
#
# Pulls 5 random dinner recipes per tick and writes each one as its own JSON file
# (RecipeJson/<title>.json) wrapped in {recipes:[<single>]} — the shape
# import-spoon.ts's per-file normalizer expects.
#
# Cost model (Spoonacular Starter, 200 pts/day cap):
#   1 pt base + 5 recipes + 5 nutrition = ~11 pts/call.
#   Cron fires every 2h = 12 calls/day = ~132 pts/day, ~60 recipes/day,
#   leaving 68 pts/day of headroom.
#
# The X-API-Quota-* headers are surfaced on the last line so cron's log
# captures real-time usage for the 24h capacity re-check.

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..' '..')
$RecipeDir = Join-Path $RepoRoot 'RecipeJson'
if (-not (Test-Path $RecipeDir)) {
    New-Item -ItemType Directory -Path $RecipeDir -Force | Out-Null
}

# Resolve the Spoonacular API key from .env first (so cron and interactive shells
# behave identically), then fall back to $env:SpoonacularApiKey for back-compat
# with the prior interactive-only setup. Importer reads the same .env via dotenv.
$ApiKey = $null
$envFile = Join-Path $RepoRoot '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*SPOONACULAR_API_KEY\s*=\s*(.+?)\s*$') {
            $ApiKey = $Matches[1].Trim('"').Trim("'")
            break
        }
    }
}
if (-not $ApiKey) { $ApiKey = $env:SpoonacularApiKey }
if (-not $ApiKey) {
    Write-Host 'Spoonacular API key not set. Add SPOONACULAR_API_KEY=... to .env'
    exit 1
}

$Uri = 'https://api.spoonacular.com/recipes/random?' +
'number=3' +
'&include-tags=dinner' +
'&exclude-tags=seafood,shellfish,peanut,dessert' +
'&includeNutrition=true' +
"&apiKey=$ApiKey"

# Invoke-WebRequest (not Invoke-RestMethod) so we can read response headers
# for X-API-Quota-* — Invoke-RestMethod discards them.
try {
    $response = Invoke-WebRequest -Uri $Uri -Method GET -ErrorAction Stop
}
catch {
    Write-Host "[spoon] fetch failed: $($_.Exception.Message)"
    exit 1
}

$body = $response.Content | ConvertFrom-Json
if (-not $body.recipes -or $body.recipes.Count -eq 0) {
    Write-Host '[spoon] response contained no recipes'
    exit 1
}

# Per-recipe file so the importer's per-file ledger + per-file error isolation
# both keep working. Filename sanitization mirrors the original script.
$written = 0
foreach ($recipe in $body.recipes) {
    $title = $recipe.title
    if (-not $title) {
        Write-Host '[spoon] skipped recipe with no title'
        continue
    }
    $safeTitle = $title.Replace(' ', '_') -replace '[\\/:*?"<>|&]', '_'
    $outPath = Join-Path $RecipeDir "$safeTitle.json"

    $wrapped = [pscustomobject]@{ recipes = @($recipe) }
    $wrapped | ConvertTo-Json -Depth 100 | Out-File -FilePath $outPath -Encoding utf8
    Write-Host "[spoon] wrote $safeTitle.json"
    $written++
}

function Get-Header($name) {
    $value = $response.Headers[$name]
    if ($null -eq $value) { return 'n/a' }
    if ($value -is [System.Array]) { return $value[0] }
    return $value
}

$quotaRequest = Get-Header 'X-API-Quota-Request'
$quotaUsed = Get-Header 'X-API-Quota-Used'
$quotaLeft = Get-Header 'X-API-Quota-Left'

Write-Host "[spoon] wrote=$written quota_request=$quotaRequest quota_used=$quotaUsed quota_left=$quotaLeft"
