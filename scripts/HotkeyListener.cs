using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;

namespace SoulsGameDeathCounter {
    class HotkeyListener {
        // Win32 API constants & delegates
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [StructLayout(LayoutKind.Sequential)]
        private struct MSG {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public int pt_x;
            public int pt_y;
        }

        [DllImport("user32.dll")]
        private static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

        [DllImport("user32.dll")]
        private static extern bool TranslateMessage([In] ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern IntPtr DispatchMessage([In] ref MSG lpMsg);

        const int DEFAULT_ADD_KEY = 0x77;  // F8
        const int DEFAULT_UNDO_KEY = 0x76; // F7
        const string DEFAULT_SERVER_URL = "https://soulgamedc-rosy.vercel.app";

        static string serverUrl = DEFAULT_SERVER_URL;
        static int addKeyVk = DEFAULT_ADD_KEY;
        static int undoKeyVk = DEFAULT_UNDO_KEY;
        static bool shortcutsEnabled = true;

        static bool isAddKeyDown = false;
        static bool isUndoKeyDown = false;

        static string dataFilePath = "";
        static string hotkeyConfigPath = "";
        static string logFilePath = "";
        static IntPtr hookId = IntPtr.Zero;
        static LowLevelKeyboardProc proc;

        static long lastActionTime = 0;
        static readonly object actionLock = new object();

        static int localDeaths = 0;
        static int localSessionDeaths = 0;
        static int localAllTimeDeaths = 0;
        static long localLastUpdated = 0;
        static readonly object stateLock = new object();
        static string localStatePath = "";

        static string GetLocalStatePath() {
            if (!string.IsNullOrEmpty(localStatePath)) return localStatePath;
            try {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string dir = Path.Combine(localAppData, "SoulsDeathCounter");
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                localStatePath = Path.Combine(dir, "death-state.json");
            } catch {
                localStatePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "death-state.json");
            }
            return localStatePath;
        }

        static void LoadLocalState() {
            try {
                string path = GetLocalStatePath();
                string fallback = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "death-state.json");
                string usePath = File.Exists(path) ? path : (File.Exists(fallback) ? fallback : null);
                if (usePath != null) {
                    string json = File.ReadAllText(usePath);
                    Match mD = Regex.Match(json, @"""deaths""\s*:\s*(\d+)");
                    Match mS = Regex.Match(json, @"""sessionDeaths""\s*:\s*(\d+)");
                    Match mA = Regex.Match(json, @"""allTimeDeaths""\s*:\s*(\d+)");
                    Match mT = Regex.Match(json, @"""lastUpdated""\s*:\s*(\d+)");
                    if (mD.Success) int.TryParse(mD.Groups[1].Value, out localDeaths);
                    if (mS.Success) int.TryParse(mS.Groups[1].Value, out localSessionDeaths);
                    if (mA.Success) int.TryParse(mA.Groups[1].Value, out localAllTimeDeaths);
                    if (mT.Success) long.TryParse(mT.Groups[1].Value, out localLastUpdated);
                }
            } catch {}
        }

        static void SaveLocalState() {
            try {
                string path = GetLocalStatePath();
                string json = string.Format(
                    "{{\n  \"deaths\": {0},\n  \"sessionDeaths\": {1},\n  \"allTimeDeaths\": {2},\n  \"lastUpdated\": {3}\n}}",
                    localDeaths, localSessionDeaths, localAllTimeDeaths, localLastUpdated
                );
                File.WriteAllText(path, json);
            } catch {}
        }

        static void Log(string msg) {
            try {
                if (string.IsNullOrEmpty(logFilePath)) {
                    logFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "hotkey.log");
                }
                File.AppendAllText(logFilePath, DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + Environment.NewLine);
            } catch {}
        }

        static void Main(string[] args) {
            // Enable TLS 1.2 for modern HTTPS connections if hosted remotely
            try {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;
            } catch {}

            logFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "hotkey.log");
            Log("==========================================");
            Log("Started native global hotkey daemon PID " + Process.GetCurrentProcess().Id);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            hotkeyConfigPath = Path.Combine(baseDir, "hotkey-config.json");
            dataFilePath = Path.Combine(baseDir, "..", "death-counter-data.json");
            if (!File.Exists(dataFilePath)) {
                dataFilePath = Path.Combine(baseDir, "death-counter-data.json");
            }

            // Command line argument override for server URL
            if (args != null && args.Length > 0 && !string.IsNullOrEmpty(args[0])) {
                serverUrl = args[0].TrimEnd('/');
                Log("Server URL overridden by command line: " + serverUrl);
            }

            ReadConfig();
            LoadLocalState();

            Log("Data file path: " + dataFilePath + " (Exists: " + File.Exists(dataFilePath) + ")");
            Log("Target Server URL: " + serverUrl);
            if (localDeaths > 0) {
                Log("Loaded previous local score from PC: " + localDeaths + " Deaths");
            }

            // Direct OBS Local Server (http://127.0.0.1:4455)
            StartLocalHttpServer();

            // Background config watcher
            Thread configThread = new Thread(new ThreadStart(ConfigWatchLoop));
            configThread.IsBackground = true;
            configThread.Start();

            // Secondary polling thread (safety net for exclusive fullscreen DirectX inputs)
            Thread asyncThread = new Thread(new ThreadStart(AsyncPollingLoop));
            asyncThread.IsBackground = true;
            asyncThread.Start();

            // Primary Low-Level Keyboard Hook
            proc = HookCallback;
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule) {
                hookId = SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }

            Log(string.Format("Global hook active. Server={0}, AddKey=0x{1:X2}, UndoKey=0x{2:X2}", serverUrl, addKeyVk, undoKeyVk));

            // Standard Windows message loop to keep the hook active
            MSG msg;
            while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            if (hookId != IntPtr.Zero) {
                UnhookWindowsHookEx(hookId);
            }
        }

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (nCode >= 0 && shortcutsEnabled) {
                int msg = wParam.ToInt32();
                bool isDown = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN);
                bool isUp = (msg == WM_KEYUP || msg == WM_SYSKEYUP);

                if (isDown || isUp) {
                    int vkCode = Marshal.ReadInt32(lParam);

                    if (vkCode == addKeyVk) {
                        if (isDown) {
                            if (!isAddKeyDown) {
                                isAddKeyDown = true;
                                TriggerDebouncedAction("add");
                            }
                        } else if (isUp) {
                            isAddKeyDown = false;
                        }
                    } else if (vkCode == undoKeyVk) {
                        if (isDown) {
                            if (!isUndoKeyDown) {
                                isUndoKeyDown = true;
                                TriggerDebouncedAction("undo");
                            }
                        } else if (isUp) {
                            isUndoKeyDown = false;
                        }
                    }
                }
            }
            return CallNextHookEx(hookId, nCode, wParam, lParam);
        }

        static void AsyncPollingLoop() {
            while (true) {
                Thread.Sleep(20);

                if (!shortcutsEnabled) continue;

                // Check Add Key (e.g. F8)
                bool addIsDown = (GetAsyncKeyState(addKeyVk) & 0x8000) != 0;
                if (addIsDown) {
                    if (!isAddKeyDown) {
                        isAddKeyDown = true;
                        TriggerDebouncedAction("add");
                    }
                } else {
                    isAddKeyDown = false;
                }

                // Check Undo Key (e.g. F7)
                bool undoIsDown = (GetAsyncKeyState(undoKeyVk) & 0x8000) != 0;
                if (undoIsDown) {
                    if (!isUndoKeyDown) {
                        isUndoKeyDown = true;
                        TriggerDebouncedAction("undo");
                    }
                } else {
                    isUndoKeyDown = false;
                }
            }
        }

        static void TriggerDebouncedAction(string action) {
            long now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
            lock (actionLock) {
                if (now - lastActionTime < 350) {
                    return; // Debounce window
                }
                lastActionTime = now;
            }

            int curD, curS, curA;
            long curT;

            lock (stateLock) {
                if (action == "add") {
                    localDeaths++;
                    localSessionDeaths++;
                    localAllTimeDeaths++;
                } else if (action == "undo") {
                    if (localDeaths > 0) localDeaths--;
                    if (localSessionDeaths > 0) localSessionDeaths--;
                }
                localLastUpdated = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                SaveLocalState();

                curD = localDeaths;
                curS = localSessionDeaths;
                curA = localAllTimeDeaths;
                curT = localLastUpdated;
            }

            Log(string.Format("Global key triggered '{0}'. Local Deaths={1}.", action, curD));

            if (!string.IsNullOrEmpty(serverUrl) && serverUrl.Contains("channel=")) {
                ThreadPool.QueueUserWorkItem(delegate {
                    try {
                        using (WebClient client = new WebClient()) {
                            client.Headers[HttpRequestHeader.ContentType] = "application/json";
                            string endpoint = serverUrl.TrimEnd('/') + "/api/action";
                            string payload = string.Format(
                                "{{\"action\":\"{0}\",\"deaths\":{1},\"sessionDeaths\":{2},\"allTimeDeaths\":{3},\"lastUpdated\":{4}}}",
                                action, curD, curS, curA, curT
                            );
                            string res = client.UploadString(endpoint, "POST", payload);
                            Log("Action '" + action + "' response: " + res);
                        }
                    } catch (Exception ex) {
                        Log("Action error: " + ex.Message);
                    }
                });
            }
        }

        private static HttpListener localHttpListener = null;
        private static Thread localHttpThread = null;
        private static bool isLocalServerRunning = false;

        private static void StartLocalHttpServer() {
            try {
                localHttpListener = new HttpListener();
                localHttpListener.Prefixes.Add("http://127.0.0.1:4455/");
                localHttpListener.Start();
                isLocalServerRunning = true;
                localHttpThread = new Thread(LocalHttpLoop);
                localHttpThread.IsBackground = true;
                localHttpThread.Start();
                Log("Direct OBS Server active on http://127.0.0.1:4455");
            } catch (Exception ex) {
                Log("Local server notice on port 4455: " + ex.Message);
            }
        }

        private static void LocalHttpLoop() {
            while (isLocalServerRunning && localHttpListener != null && localHttpListener.IsListening) {
                try {
                    HttpListenerContext context = localHttpListener.GetContext();
                    ThreadPool.QueueUserWorkItem(delegate {
                        HandleLocalRequest(context);
                    });
                } catch {
                    if (!isLocalServerRunning) break;
                }
            }
        }

        private static void HandleLocalRequest(HttpListenerContext context) {
            try {
                HttpListenerRequest req = context.Request;
                HttpListenerResponse res = context.Response;

                res.Headers["Access-Control-Allow-Origin"] = "*";
                res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                res.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
                res.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";

                if (req.HttpMethod == "OPTIONS") {
                    res.StatusCode = 204;
                    res.Close();
                    return;
                }

                string path = req.Url.AbsolutePath.ToLowerInvariant();

                if (req.HttpMethod == "GET" && (path == "/api/state" || path == "/" || path == "/state")) {
                    string json;
                    lock (stateLock) {
                        json = string.Format(
                            "{{\"deaths\":{0},\"sessionDeaths\":{1},\"allTimeDeaths\":{2},\"lastUpdated\":{3},\"isLocal\":true}}",
                            localDeaths, localSessionDeaths, localAllTimeDeaths, localLastUpdated
                        );
                    }
                    byte[] buffer = System.Text.Encoding.UTF8.GetBytes(json);
                    res.ContentType = "application/json";
                    res.ContentLength64 = buffer.Length;
                    res.StatusCode = 200;
                    res.OutputStream.Write(buffer, 0, buffer.Length);
                    res.OutputStream.Close();
                    return;
                }

                if (req.HttpMethod == "POST" && (path == "/api/action" || path == "/action" || path == "/api/state")) {
                    string body = "";
                    using (StreamReader reader = new StreamReader(req.InputStream, req.ContentEncoding)) {
                        body = reader.ReadToEnd();
                    }

                    Match mAct = Regex.Match(body, @"""action""\s*:\s*""([^""]+)""");
                    Match mDeaths = Regex.Match(body, @"""deaths""\s*:\s*(\d+)");
                    Match mSession = Regex.Match(body, @"""sessionDeaths""\s*:\s*(\d+)");
                    Match mAllTime = Regex.Match(body, @"""allTimeDeaths""\s*:\s*(\d+)");

                    string action = mAct.Success ? mAct.Groups[1].Value : "";

                    int curD, curS, curA;
                    long curT;

                    lock (stateLock) {
                        if (action == "add" || action == "addDeath") {
                            localDeaths++;
                            localSessionDeaths++;
                            localAllTimeDeaths++;
                        } else if (action == "undo" || action == "undoDeath") {
                            if (localDeaths > 0) localDeaths--;
                            if (localSessionDeaths > 0) localSessionDeaths--;
                        }

                        if (mDeaths.Success) int.TryParse(mDeaths.Groups[1].Value, out localDeaths);
                        if (mSession.Success) int.TryParse(mSession.Groups[1].Value, out localSessionDeaths);
                        if (mAllTime.Success) int.TryParse(mAllTime.Groups[1].Value, out localAllTimeDeaths);

                        localLastUpdated = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                        SaveLocalState();

                        curD = localDeaths;
                        curS = localSessionDeaths;
                        curA = localAllTimeDeaths;
                        curT = localLastUpdated;
                    }

                    string json = string.Format(
                        "{{\"success\":true,\"deaths\":{0},\"sessionDeaths\":{1},\"allTimeDeaths\":{2},\"lastUpdated\":{3},\"isLocal\":true}}",
                        curD, curS, curA, curT
                    );
                    byte[] buffer = System.Text.Encoding.UTF8.GetBytes(json);
                    res.ContentType = "application/json";
                    res.ContentLength64 = buffer.Length;
                    res.StatusCode = 200;
                    res.OutputStream.Write(buffer, 0, buffer.Length);
                    res.OutputStream.Close();
                    return;
                }

                res.StatusCode = 404;
                res.Close();
            } catch {}
        }

        static void ConfigWatchLoop() {
            while (true) {
                Thread.Sleep(2000);
                ReadConfig();
            }
        }

        static void ReadConfig() {
            try {
                // 1. Check local hotkey-config.json (for remote hosted setups)
                if (File.Exists(hotkeyConfigPath)) {
                    string hJson = File.ReadAllText(hotkeyConfigPath);
                    var mUrl = Regex.Match(hJson, @"""serverUrl""\s*:\s*""([^""]+)""");
                    if (mUrl.Success && !string.IsNullOrEmpty(mUrl.Groups[1].Value)) {
                        string newUrl = mUrl.Groups[1].Value.TrimEnd('/');
                        if (newUrl != serverUrl) {
                            serverUrl = newUrl;
                            Log("Server URL updated from hotkey-config.json: " + serverUrl);
                        }
                    }
                    ParseKeysFromJson(hJson);
                }

                // 2. Check death-counter-data.json
                if (File.Exists(dataFilePath)) {
                    string json = File.ReadAllText(dataFilePath);
                    ParseKeysFromJson(json);
                }
            } catch (Exception ex) {
                Log("ReadConfig error: " + ex.Message);
            }
        }

        static void ParseKeysFromJson(string json) {
            // Parse addDeath key name
            Match mAdd = Regex.Match(json, @"""addDeath""\s*:\s*""([^""]+)""");
            if (mAdd.Success) {
                int parsed = ParseKey(mAdd.Groups[1].Value, DEFAULT_ADD_KEY);
                if (parsed != addKeyVk) {
                    addKeyVk = parsed;
                    Log("AddKey updated to: 0x" + addKeyVk.ToString("X2"));
                }
            }

            // Parse undoDeath key name
            Match mUndo = Regex.Match(json, @"""undoDeath""\s*:\s*""([^""]+)""");
            if (mUndo.Success) {
                int parsed = ParseKey(mUndo.Groups[1].Value, DEFAULT_UNDO_KEY);
                if (parsed != undoKeyVk) {
                    undoKeyVk = parsed;
                    Log("UndoKey updated to: 0x" + undoKeyVk.ToString("X2"));
                }
            }

            // Parse enabled
            Match mEn = Regex.Match(json, @"""enabled""\s*:\s*(true|false)");
            if (mEn.Success) {
                shortcutsEnabled = mEn.Groups[1].Value == "true";
            }
        }

        static int ParseKey(string keyName, int fallback) {
            if (string.IsNullOrEmpty(keyName)) return fallback;
            keyName = keyName.Trim().ToUpperInvariant();

            int num;

            // F1 - F24
            if (keyName.StartsWith("F") && int.TryParse(keyName.Substring(1), out num) && num >= 1 && num <= 24) {
                return 0x6F + num;
            }

            // Numpad
            if (keyName == "+" || keyName == "NUMPADADD" || keyName == "ADD") return 0x6B;
            if (keyName == "-" || keyName == "NUMPADSUBTRACT" || keyName == "SUBTRACT") return 0x6D;
            if (keyName == "*" || keyName == "NUMPADMULTIPLY" || keyName == "MULTIPLY") return 0x6A;
            if (keyName == "/" || keyName == "NUMPADDIVIDE" || keyName == "DIVIDE") return 0x6F;
            if (keyName.StartsWith("NUMPAD") && int.TryParse(keyName.Substring(6), out num) && num >= 0 && num <= 9) {
                return 0x60 + num;
            }

            // Navigation
            if (keyName == "INSERT") return 0x2D;
            if (keyName == "DELETE") return 0x2E;
            if (keyName == "HOME") return 0x24;
            if (keyName == "END") return 0x23;
            if (keyName == "PAGEUP") return 0x21;
            if (keyName == "PAGEDOWN") return 0x22;

            // Single letters / numbers
            if (keyName.Length == 1) {
                char c = keyName[0];
                if (c >= 'A' && c <= 'Z') return (int)c;
                if (c >= '0' && c <= '9') return (int)c;
            }

            return fallback;
        }
    }
}
