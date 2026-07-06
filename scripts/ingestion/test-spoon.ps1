# Spoonacular batch fetch.
#
# Uses complexSearch with weekday-cuisine x per-tick-course rotation. Each
# 2-hour tick selects today's cuisine and one of 12 course/equipment themes,
# then writes number=3 results as individual JSON files (RecipeJson/<title>.json)
# wrapped in {recipes:[<single>]} -- the shape import-spoon.ts's per-file
# normalizer expects.
#
# Cost model (Spoonacular Starter, 200 pts/day cap):
#   complexSearch + 3 enriched results = ~1.3 pts/tick.
#   Cron fires every 2h = 12 ticks/day at number=3 = ~16 pts/day,
#   leaving substantial headroom under the daily cap.
#
# Enrichment flags are mandatory so normalize.ts receives nutrition,
# extendedIngredients, and analyzedInstructions.
#
# The X-API-Quota-* headers are surfaced on the last line so cron's log
# captures real-time usage for the 24h capacity re-check.

$CuisineByDay = @('French', 'Italian', 'Mexican', 'Asian', 'Indian', 'Mediterranean', 'American')
$CourseCycle = @(
    @{ Param = 'equipment'; Value = 'frying pan' },
    @{ Param = 'type'; Value = 'soup' },
    @{ Param = 'type'; Value = 'salad' },
    @{ Param = 'equipment'; Value = 'slow cooker' },
    @{ Param = 'equipment'; Value = 'pressure cooker' },
    @{ Param = 'equipment'; Value = 'airfryer' },
    @{ Param = 'type'; Value = 'main course' },
    @{ Param = 'type'; Value = 'appetizer' },
    @{ Param = 'equipment'; Value = 'rice cooker' },
    @{ Param = 'equipment'; Value = 'stove' },
    @{ Param = 'type'; Value = 'side dish' },
    @{ Param = 'type'; Value = 'fingerfood' }
)

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

$cuisine = $CuisineByDay[[int](Get-Date).DayOfWeek]
$tickIndex = [math]::Floor((Get-Date).Hour / 2)
$course = $CourseCycle[$tickIndex]

$query = @(
    "cuisine=$([uri]::EscapeDataString($cuisine))",
    "$($course.Param)=$([uri]::EscapeDataString($course.Value))",
    "excludeIngredients=$([uri]::EscapeDataString('seafood,shellfish,peanut'))",
    'sort=popularity',
    'number=3',
    'addRecipeInformation=true',
    'addRecipeInstructions=true',
    'addRecipeNutrition=true',
    "apiKey=$([uri]::EscapeDataString($ApiKey))"
)
$Uri = 'https://api.spoonacular.com/recipes/complexSearch?' + ($query -join '&')

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
if (-not $body.results -or $body.results.Count -eq 0) {
    Write-Host "[spoon] response contained no results cuisine=$cuisine course=$($course.Value) tick=$tickIndex"
    exit 0
}

# Per-recipe file so the importer's per-file ledger + per-file error isolation
# both keep working. Filename sanitization mirrors the original script.
$written = 0
foreach ($result in $body.results) {
    $title = $result.title
    if (-not $title) {
        Write-Host '[spoon] skipped recipe with no title'
        continue
    }
    $safeTitle = $title.Replace(' ', '_') -replace '[\\/:*?"<>|&]', '_'
    $outPath = Join-Path $RecipeDir "$safeTitle.json"

    $wrapped = [pscustomobject]@{ recipes = @($result) }
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

Write-Host "[spoon] wrote=$written cuisine=$cuisine course=$($course.Value) tick=$tickIndex quota_request=$quotaRequest quota_used=$quotaUsed quota_left=$quotaLeft"
