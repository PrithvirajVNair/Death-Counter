; ==============================================================================
; Souls Game Death Counter - Global Hotkeys (AutoHotkey Script)
; Safe, open-source script. Zero warnings, zero installation.
; ==============================================================================
#NoEnv
#SingleInstance Force
SetWorkingDir %A_ScriptDir%

; Production Endpoint
SERVER_URL := "https://soulgamedc-rosy.vercel.app/api/action"

TrayTip, Souls Death Counter, Hotkeys Active: F8 (+1 Death), F7 (Undo), 3
SetTimer, HideTrayTip, -3000

; F8: Add Death
F8::
  SendCounterAction("add")
return

; F7: Undo Death
F7::
  SendCounterAction("undo")
return

; F9: Add Boss Kill (Optional)
F9::
  SendCounterAction("addBossKill")
return

; F10: Undo Boss Kill (Optional)
F10::
  SendCounterAction("undoBossKill")
return

SendCounterAction(actionName) {
  global SERVER_URL
  try {
    http := ComObjCreate("WinHttp.WinHttpRequest.5.1")
    http.Open("POST", SERVER_URL, true)
    http.SetRequestHeader("Content-Type", "application/json")
    http.SetRequestHeader("User-Agent", "SoulsDeathCounterAHK/2.0")
    http.Send("{""action"":""" . actionName . """}")
  }
}

HideTrayTip() {
  TrayTip
}
