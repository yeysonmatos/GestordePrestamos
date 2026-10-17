$path = Join-Path $PSScriptRoot "tmp-session.json"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8099/")
$listener.Start()
$deadline = (Get-Date).AddSeconds(300)
while ((Get-Date) -lt $deadline) {
  try {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Cache-Control", "no-store")
    if (Test-Path $path) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $res.ContentType = "application/json"
      $res.StatusCode = 200
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    $res.Close()
  } catch { }
}
$listener.Stop()
