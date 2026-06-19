$base = Join-Path $PSScriptRoot "..\src\app"
$files = @(
  "Pages\league-details\league-details.component.css",
  "Components\league-bracket\league-bracket.component.css",
  "Pages\profile\profile.component.css",
  "Pages\team-details\team-details.component.css"
)
$replacements = [ordered]@{
  '#ff5500' = 'var(--gc-orange)'
  '#ff4500' = 'var(--gc-orange)'
  '#f0f0f0' = 'var(--gc-text)'
  '#b0b0b0' = 'var(--gc-text-secondary)'
  '#a0a0a0' = 'var(--gc-text-secondary)'
  '#1a1a1a' = 'var(--gc-surface)'
  '#111111' = 'var(--gc-bg-secondary)'
  '#2d2d2d' = 'var(--gc-border)'
  '#3a3a3a' = 'var(--gc-border-light)'
  '#28a745' = 'var(--gc-green)'
  '#22c55e' = 'var(--gc-green)'
  '#218838' = 'var(--gc-green-hover)'
  '#ffc107' = 'var(--gc-yellow)'
  '#ffd700' = 'var(--gc-yellow)'
  '#e0a800' = 'var(--gc-yellow-hover)'
  '#dc3545' = 'var(--gc-red)'
  '#c82333' = 'var(--gc-red-hover)'
  '#6c757d' = 'var(--gc-text-muted)'
  '#333' = 'var(--gc-text-on-success)'
  '#fff' = 'var(--gc-text-on-primary)'
  '#3b3b64' = 'var(--gc-table-bg)'
  '#4a4a7a' = 'var(--gc-table-header)'
  '#4f4f81' = 'var(--gc-surface-hover)'
  '#5d5d8e' = 'var(--gc-table-border)'
  '#6a6a99' = 'var(--gc-surface-elevated)'
  '#2a2a4a' = 'var(--gc-table-bg)'
  '#3b3b6b' = 'var(--gc-table-header)'
  '#4a4a8a' = 'var(--gc-table-border)'
  '#10243a' = 'var(--gc-bg-secondary)'
  '#1e293b' = 'var(--gc-surface)'
  '#38bdf8' = 'var(--gc-orange)'
  '#0ea5e9' = 'var(--gc-orange-hover)'
  '#6a0572' = 'var(--gc-surface-elevated)'
  '#9d00a1' = 'var(--gc-orange)'
  '#888' = 'var(--gc-text-muted)'
  '#eee' = 'var(--gc-text)'
  '#ccc' = 'var(--gc-text-secondary)'
  '#000' = 'var(--gc-bg)'
}
foreach ($rel in $files) {
  $file = Join-Path $base $rel
  if (-not (Test-Path $file)) { continue }
  $content = Get-Content $file -Raw
  foreach ($k in $replacements.Keys) {
    $content = $content.Replace($k, $replacements[$k])
  }
  $content = $content -replace 'var\(--gc-border, var\(--gc-border\)\)', 'var(--gc-border)'
  $content = $content -replace 'var\(--primary, #2563eb\)', 'var(--gc-orange)'
  $content = $content -replace 'var\(--primary-dark, #1e40af\)', 'var(--gc-orange-hover)'
  Set-Content $file $content -NoNewline
  Write-Host "Updated $rel"
}
