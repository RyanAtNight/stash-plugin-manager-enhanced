param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Message
)

$ErrorActionPreference = "Stop"

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastTemplateType, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null

$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
  [Windows.UI.Notifications.ToastTemplateType]::ToastText02
)
$text = $xml.GetElementsByTagName("text")
$text.Item(0).AppendChild($xml.CreateTextNode($Title)) | Out-Null
$text.Item(1).AppendChild($xml.CreateTextNode($Message)) | Out-Null

$audio = $xml.CreateElement("audio")
$audio.SetAttribute("src", "ms-winsoundevent:Notification.Default")
$xml.DocumentElement.AppendChild($audio) | Out-Null

$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(2)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Stash Plugin Manager Enhanced").Show($toast)

# Play explicitly as well so deployments remain audible when toast audio is suppressed.
[System.Media.SystemSounds]::Asterisk.Play()
Start-Sleep -Milliseconds 600
Write-Output "Deployment notification delivered."
