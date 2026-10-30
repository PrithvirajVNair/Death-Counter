using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Souls Game Death Counter Hotkeys")]
[assembly: AssemblyDescription("Global hotkey companion app for Souls Game Death Counter OBS overlay")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("Souls Death Counter Open Source Community")]
[assembly: AssemblyProduct("Souls Game Death Counter")]
[assembly: AssemblyCopyright("Copyright (c) 2026 Open Source MIT")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]
[assembly: AssemblyVersion("2.1.0.0")]
[assembly: AssemblyFileVersion("2.1.0.0")]

namespace SoulsGameDeathCounter {
    public class HotkeyBinding {
        public int KeyVk { get; set; }
        public bool Ctrl { get; set; }
        public bool Alt { get; set; }
        public bool Shift { get; set; }
        public bool Win { get; set; }
        public string DisplayName { get; set; }

        public bool IsConfigured {
            get { return KeyVk > 0; }
        }

        public static HotkeyBinding NotConfigured() {
            return new HotkeyBinding {
                KeyVk = 0,
                Ctrl = false,
                Alt = false,
                Shift = false,
                Win = false,
                DisplayName = "Not Configured"
            };
        }

        public static HotkeyBinding Create(int vk, bool ctrl, bool alt, bool shift, bool win, string baseName) {
            if (vk <= 0) return NotConfigured();
            return new HotkeyBinding {
                KeyVk = vk,
                Ctrl = ctrl,
                Alt = alt,
                Shift = shift,
                Win = win,
                DisplayName = BuildDisplayName(ctrl, alt, shift, win, baseName)
            };
        }

        public static HotkeyBinding FromString(string str, int defaultVk, string defaultName) {
            if (string.IsNullOrEmpty(str)) {
                if (defaultVk > 0) return FromString(defaultName, 0, "");
                return NotConfigured();
            }

            string s = str.Trim();
            if (s.Equals("Not Configured", StringComparison.OrdinalIgnoreCase) ||
                s.Equals("None", StringComparison.OrdinalIgnoreCase) ||
                s.Equals("Disabled", StringComparison.OrdinalIgnoreCase) ||
                s.Equals("Unbound", StringComparison.OrdinalIgnoreCase) ||
                s == "" || s == "0") {
                return NotConfigured();
            }

            bool ctrl = false, alt = false, shift = false, win = false;
            string[] parts = s.Split(new char[] { '+' }, StringSplitOptions.RemoveEmptyEntries);
            string baseKeyStr = "";

            for (int i = 0; i < parts.Length; i++) {
                string p = parts[i].Trim();
                if (p.Equals("Ctrl", StringComparison.OrdinalIgnoreCase) || p.Equals("Control", StringComparison.OrdinalIgnoreCase)) {
                    ctrl = true;
                } else if (p.Equals("Alt", StringComparison.OrdinalIgnoreCase) || p.Equals("Menu", StringComparison.OrdinalIgnoreCase)) {
                    alt = true;
                } else if (p.Equals("Shift", StringComparison.OrdinalIgnoreCase)) {
                    shift = true;
                } else if (p.Equals("Win", StringComparison.OrdinalIgnoreCase) || p.Equals("Windows", StringComparison.OrdinalIgnoreCase)) {
                    win = true;
                } else {
                    baseKeyStr = p;
                }
            }

            if (string.IsNullOrEmpty(baseKeyStr)) {
                return NotConfigured();
            }

            int vk = ParseBaseKey(baseKeyStr, defaultVk);
            if (vk <= 0) return NotConfigured();

            string baseName = FormatBaseKeyName((Keys)vk, vk);
            return Create(vk, ctrl, alt, shift, win, baseName);
        }

        public static string BuildDisplayName(bool ctrl, bool alt, bool shift, bool win, string baseName) {
            List<string> parts = new List<string>();
            if (ctrl) parts.Add("Ctrl");
            if (alt) parts.Add("Alt");
            if (shift) parts.Add("Shift");
            if (win) parts.Add("Win");
            parts.Add(baseName);
            return string.Join(" + ", parts.ToArray());
        }

        public bool MatchesModifiers() {
            bool ctrlDown = HotkeyAppForm.isCtrlHeld || HotkeyAppForm.IsCtrlDown();
            bool altDown = HotkeyAppForm.isAltHeld || HotkeyAppForm.IsAltDown();
            bool shiftDown = HotkeyAppForm.isShiftHeld || HotkeyAppForm.IsShiftDown();
            bool winDown = HotkeyAppForm.isWinHeld || HotkeyAppForm.IsWinDown();

            return (Ctrl == ctrlDown) && (Alt == altDown) && (Shift == shiftDown) && (Win == winDown);
        }

        public static int ParseBaseKey(string keyName, int fallback) {
            if (string.IsNullOrEmpty(keyName)) return fallback;
            keyName = keyName.Trim().ToUpperInvariant();

            if (keyName == "NOT CONFIGURED" || keyName == "NONE" || keyName == "DISABLED" || keyName == "UNBOUND") return 0;

            int num;
            if (keyName.StartsWith("F") && int.TryParse(keyName.Substring(1), out num) && num >= 1 && num <= 24) {
                return 0x6F + num;
            }
            if (keyName == "+" || keyName == "NUMPADADD" || keyName == "ADD") return 0x6B;
            if (keyName == "-" || keyName == "NUMPADSUBTRACT" || keyName == "SUBTRACT") return 0x6D;
            if (keyName == "*" || keyName == "NUMPADMULTIPLY" || keyName == "MULTIPLY") return 0x6A;
            if (keyName == "/" || keyName == "NUMPADDIVIDE" || keyName == "DIVIDE") return 0x6F;
            if (keyName.StartsWith("NUMPAD") && int.TryParse(keyName.Substring(6), out num) && num >= 0 && num <= 9) {
                return 0x60 + num;
            }
            if (keyName == "INSERT") return 0x2D;
            if (keyName == "DELETE" || keyName == "DEL") return 0x2E;
            if (keyName == "HOME") return 0x24;
            if (keyName == "END") return 0x23;
            if (keyName == "PAGEUP" || keyName == "PGUP") return 0x21;
            if (keyName == "PAGEDOWN" || keyName == "PGDN") return 0x22;
            if (keyName == "SPACE") return 0x20;
            if (keyName == "TAB") return 0x09;
            if (keyName == "RETURN" || keyName == "ENTER") return 0x0D;

            if (keyName.Length == 1) {
                char c = keyName[0];
                if (c >= 'A' && c <= 'Z') return (int)c;
                if (c >= '0' && c <= '9') return (int)c;
            }

            try {
                Keys parsed = (Keys)Enum.Parse(typeof(Keys), keyName, true);
                return (int)parsed;
            } catch {}

            return fallback;
        }

        public static string FormatBaseKeyName(Keys k, int vk) {
            if (vk >= 0x70 && vk <= 0x87) {
                return "F" + (vk - 0x6F);
            }
            if (vk >= 0x60 && vk <= 0x69) {
                return "NumPad" + (vk - 0x60);
            }
            if (vk == 0x6B) return "NumPadAdd";
            if (vk == 0x6D) return "NumPadSubtract";
            if (vk == 0x6A) return "NumPadMultiply";
            if (vk == 0x6F) return "NumPadDivide";
            if (vk == 0x20) return "Space";
            if (vk == 0x0D) return "Enter";
            if (vk == 0x09) return "Tab";
            if (vk == 0x2D) return "Insert";
            if (vk == 0x2E) return "Delete";
            if (vk == 0x24) return "Home";
            if (vk == 0x23) return "End";
            if (vk == 0x21) return "PageUp";
            if (vk == 0x22) return "PageDown";
            if (vk >= 0x30 && vk <= 0x39) return ((char)vk).ToString();
            if (vk >= 0x41 && vk <= 0x5A) return ((char)vk).ToString();
            return k.ToString();
        }

        public override string ToString() {
            return DisplayName ?? "Not Configured";
        }
    }

    public class HotkeyAppForm : Form {
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
        public static extern short GetAsyncKeyState(int vKey);

        // Modifier key checks
        public static bool IsCtrlDown() {
            return ((GetAsyncKeyState(0x11) & 0x8000) != 0) || ((GetAsyncKeyState(0xA2) & 0x8000) != 0) || ((GetAsyncKeyState(0xA3) & 0x8000) != 0);
        }
        public static bool IsAltDown() {
            return ((GetAsyncKeyState(0x12) & 0x8000) != 0) || ((GetAsyncKeyState(0xA4) & 0x8000) != 0) || ((GetAsyncKeyState(0xA5) & 0x8000) != 0);
        }
        public static bool IsShiftDown() {
            return ((GetAsyncKeyState(0x10) & 0x8000) != 0) || ((GetAsyncKeyState(0xA0) & 0x8000) != 0) || ((GetAsyncKeyState(0xA1) & 0x8000) != 0);
        }
        public static bool IsWinDown() {
            return ((GetAsyncKeyState(0x5B) & 0x8000) != 0) || ((GetAsyncKeyState(0x5C) & 0x8000) != 0);
        }

        private static bool IsModifierVk(int vk) {
            return vk == 0x10 || vk == 0x11 || vk == 0x12 || 
                   vk == 0xA0 || vk == 0xA1 || vk == 0xA2 || vk == 0xA3 || vk == 0xA4 || vk == 0xA5 || 
                   vk == 0x5B || vk == 0x5C;
        }

        // Live modifier state tracked directly from low-level hook
        public static volatile bool isCtrlHeld = false;
        public static volatile bool isAltHeld = false;
        public static volatile bool isShiftHeld = false;
        public static volatile bool isWinHeld = false;

        // Constants
        const int DEFAULT_ADD_KEY = 0x77;       // F8
        const int DEFAULT_UNDO_KEY = 0x76;      // F7
        const int DEFAULT_ADD_BOSS_KEY = 0x78;  // F9
        const int DEFAULT_UNDO_BOSS_KEY = 0x79; // F10
        const string DEFAULT_SERVER_URL = "https://soulgamedc-rosy.vercel.app";

        // State
        private static bool isInitializing = true;
        private static string serverUrl = DEFAULT_SERVER_URL;
        private static HotkeyBinding bindingAdd = HotkeyBinding.Create(DEFAULT_ADD_KEY, false, false, false, false, "F8");
        private static HotkeyBinding bindingUndo = HotkeyBinding.Create(DEFAULT_UNDO_KEY, false, false, false, false, "F7");
        private static HotkeyBinding bindingAddBoss = HotkeyBinding.Create(DEFAULT_ADD_BOSS_KEY, false, false, false, false, "F9");
        private static HotkeyBinding bindingUndoBoss = HotkeyBinding.Create(DEFAULT_UNDO_BOSS_KEY, false, false, false, false, "F10");
        private static bool isHotkeysActive = true;

        private static bool isAddKeyDown = false;
        private static bool isUndoKeyDown = false;
        private static bool isAddBossKeyDown = false;
        private static bool isUndoBossKeyDown = false;

        private static string recordingTarget = null; // "add", "undo", "addBoss", "undoBoss"
        private static string configFilePath = "";
        private static string dataFilePath = "";
        private static string localStateFilePath = "";
        private static IntPtr hookId = IntPtr.Zero;
        private static LowLevelKeyboardProc hookProc;
        private static long lastActionTime = 0;
        private static readonly object actionLock = new object();

        // Local Persistent State (Deaths & Boss Kills saved directly on PC)
        private static int localDeaths = 0;
        private static int localSessionDeaths = 0;
        private static int localAllTimeDeaths = 0;
        private static int localBossKills = 0;
        private static long localLastUpdated = 0;
        private static readonly object stateLock = new object();

        // Local Direct OBS Server (Runs directly on PC: http://127.0.0.1:4455)
        private static HttpListener localHttpListener = null;
        private static Thread localHttpThread = null;
        private static bool isLocalServerRunning = false;
        public const int LOCAL_SERVER_PORT = 4455;

        // Cloud & Streamer Account State (Google Sync)
        private static string streamerKey = "";
        private static string userDisplayName = "";
        private static string userEmail = "";
        private static bool isUserSignedIn = false;

        public static bool IsAuthenticated {
            get {
                return isUserSignedIn && !string.IsNullOrEmpty(streamerKey) && streamerKey != "guest";
            }
        }

        // UI Controls
        private Button btnToggle;

        // Streamer Cloud Account Controls
        private GroupBox grpAccount;
        private Label lblAccountStatus;
        private Button btnGoogleSignIn;
        private Button btnSignOut;
        private Label lblKeyTag;
        private TextBox txtStreamerKey;
        private Button btnConnectKey;
        private Button btnPasteKey;

        // Live Scoreboard Controls (Similar to Site)
        private Label lblDeathNumber;
        private Label lblDeathSub;
        private Label lblBossNumber;
        private Label lblBossSub;
        private Button btnManualAddDeath;
        private Button btnManualUndoDeath;
        private Button btnManualSetDeath;
        private Button btnManualResetDeath;
        private Button btnManualAddBoss;
        private Button btnManualUndoBoss;
        private Button btnManualSetBoss;
        private Button btnManualResetBoss;
        private bool confirmResetDeath = false;
        private bool confirmResetBoss = false;
        private System.Windows.Forms.Timer resetDeathTimer;
        private System.Windows.Forms.Timer resetBossTimer;

        private ComboBox cmbAddKey;
        private ComboBox cmbUndoKey;
        private ComboBox cmbAddBossKey;
        private ComboBox cmbUndoBossKey;
        private Button btnRecordAdd;
        private Button btnRecordUndo;
        private Button btnRecordAddBoss;
        private Button btnRecordUndoBoss;
        private Button btnClearAdd;
        private Button btnClearUndo;
        private Button btnClearAddBoss;
        private Button btnClearUndoBoss;

        private TextBox txtServerUrl;
        private Button btnTestConnection;
        private Label lblServerPing;
        private TextBox txtActivityLog;
        private CheckBox chkMinimizeToTray;
        private NotifyIcon trayIcon;

        private static HotkeyAppForm instance;

        public HotkeyAppForm() {
            try {
                instance = this;
                InitializeComponent();
                LoadConfig();
                LoadLocalState();
                isInitializing = false;
                InstallHook();
                StartAsyncPolling();
                StartBackgroundStateSync();
                StartLocalHttpServer();
                UpdateUIState();
                UpdateCountersUI();
                UpdateAccountUI();

                this.Shown += delegate {
                    UpdateCountersUI();
                    UpdateAccountUI();
                    if (!IsAuthenticated) {
                        LogActivity("==================================================");
                        LogActivity("⚠ SIGN-IN IS MANDATORY FOR THIS APP");
                        LogActivity("Offline mode has been disabled. You must sign in");
                        LogActivity("with your Streamer Account to use hotkeys & OBS.");
                        LogActivity("Click '✦ Sign in with Google' or paste your Key.");
                        LogActivity("==================================================");
                    } else {
                        TestConnectionAsync();
                        LogActivity(string.Format("✦ App ready. Signed in as {0}", userDisplayName));
                        LogActivity(string.Format("Keys: Death [{0} / {1}] | Boss [{2} / {3}]",
                            bindingAdd.DisplayName, bindingUndo.DisplayName, bindingAddBoss.DisplayName, bindingUndoBoss.DisplayName));
                        if (localDeaths > 0 || localBossKills > 0) {
                            LogActivity(string.Format("Loaded account tally: {0} Deaths, {1} Boss Slain", localDeaths, localBossKills));
                        }
                    }
                };
            } catch (Exception ex) {
                try {
                    File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "constructor_error.log"), ex.ToString());
                } catch {}
                throw;
            }
        }

        private void InitializeComponent() {
            this.Text = "Souls Game Death & Boss Counter — Hotkeys";
            this.Size = new Size(530, 925);
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(16, 17, 14);
            this.ForeColor = Color.FromArgb(226, 217, 197);
            this.Font = new Font("Segoe UI", 9F);

            try {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string icoPath = Path.Combine(baseDir, "app.ico");
                if (File.Exists(icoPath)) {
                    this.Icon = new Icon(icoPath);
                } else {
                    this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }
            } catch {}

            // ─── Header ───
            Label lblTitle = new Label();
            lblTitle.Text = "SOULS GAME DEATH & BOSS COUNTER";
            lblTitle.Font = new Font("Georgia", 12.5F, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(200, 166, 93); // Gold
            lblTitle.Location = new Point(20, 16);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            Label lblSubtitle = new Label();
            lblSubtitle.Text = "Global In-Game Hotkeys & Boss Kill Counter for OBS Overlay";
            lblSubtitle.Font = new Font("Segoe UI", 8.5F);
            lblSubtitle.ForeColor = Color.FromArgb(145, 140, 125);
            lblSubtitle.Location = new Point(22, 42);
            lblSubtitle.AutoSize = true;
            this.Controls.Add(lblSubtitle);

            Panel line = new Panel();
            line.Location = new Point(20, 66);
            line.Size = new Size(475, 1);
            line.BackColor = Color.FromArgb(74, 63, 38);
            this.Controls.Add(line);

            // ─── Big Toggle Activation Button ───
            btnToggle = new Button();
            btnToggle.Location = new Point(20, 74);
            btnToggle.Size = new Size(475, 42);
            btnToggle.FlatStyle = FlatStyle.Flat;
            btnToggle.FlatAppearance.BorderSize = 1;
            btnToggle.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            btnToggle.Cursor = Cursors.Hand;
            btnToggle.Click += BtnToggle_Click;
            this.Controls.Add(btnToggle);

            // ─── Live Scoreboard Card (Death & Boss Counts Similar to Site) ───
            GroupBox grpScoreboard = new GroupBox();
            grpScoreboard.Text = " Live Counts (Real-Time • Synced with OBS & Cloud) ";
            grpScoreboard.Location = new Point(20, 124);
            grpScoreboard.Size = new Size(475, 142);
            grpScoreboard.ForeColor = Color.FromArgb(200, 166, 93);
            grpScoreboard.BackColor = Color.FromArgb(24, 25, 20);

            // Left Box: Deaths
            Panel pnlDeath = new Panel();
            pnlDeath.Location = new Point(12, 20);
            pnlDeath.Size = new Size(220, 112);
            pnlDeath.BackColor = Color.FromArgb(16, 17, 14);
            pnlDeath.BorderStyle = BorderStyle.FixedSingle;

            Label lblDeathTag = new Label();
            lblDeathTag.Text = "DEATHS";
            lblDeathTag.Font = new Font("Georgia", 8.5F, FontStyle.Bold);
            lblDeathTag.ForeColor = Color.FromArgb(200, 166, 93);
            lblDeathTag.Location = new Point(8, 6);
            lblDeathTag.AutoSize = true;
            pnlDeath.Controls.Add(lblDeathTag);

            lblDeathNumber = new Label();
            lblDeathNumber.Text = localDeaths.ToString();
            lblDeathNumber.Font = new Font("Georgia", 22F, FontStyle.Bold);
            lblDeathNumber.ForeColor = Color.FromArgb(248, 113, 113);
            lblDeathNumber.Location = new Point(6, 22);
            lblDeathNumber.Size = new Size(204, 34);
            lblDeathNumber.Cursor = Cursors.Hand;
            lblDeathNumber.Click += delegate { PromptSetCount("death"); };
            pnlDeath.Controls.Add(lblDeathNumber);

            lblDeathSub = new Label();
            lblDeathSub.Text = string.Format("Session: {0} • Total: {1}", localSessionDeaths, localAllTimeDeaths);
            lblDeathSub.Font = new Font("Segoe UI", 7.5F);
            lblDeathSub.ForeColor = Color.FromArgb(145, 140, 125);
            lblDeathSub.Location = new Point(8, 56);
            lblDeathSub.Size = new Size(204, 16);
            pnlDeath.Controls.Add(lblDeathSub);

            btnManualAddDeath = new Button();
            btnManualAddDeath.Text = "+1 Death";
            btnManualAddDeath.Location = new Point(6, 76);
            btnManualAddDeath.Size = new Size(60, 26);
            btnManualAddDeath.FlatStyle = FlatStyle.Flat;
            btnManualAddDeath.FlatAppearance.BorderSize = 1;
            btnManualAddDeath.FlatAppearance.BorderColor = Color.FromArgb(80, 35, 35);
            btnManualAddDeath.BackColor = Color.FromArgb(42, 18, 18);
            btnManualAddDeath.ForeColor = Color.FromArgb(248, 113, 113);
            btnManualAddDeath.Font = new Font("Segoe UI", 7.5F, FontStyle.Bold);
            btnManualAddDeath.Cursor = Cursors.Hand;
            btnManualAddDeath.Click += delegate { TriggerAction("add"); };
            pnlDeath.Controls.Add(btnManualAddDeath);

            btnManualUndoDeath = new Button();
            btnManualUndoDeath.Text = "Undo";
            btnManualUndoDeath.Location = new Point(70, 76);
            btnManualUndoDeath.Size = new Size(44, 26);
            btnManualUndoDeath.FlatStyle = FlatStyle.Flat;
            btnManualUndoDeath.FlatAppearance.BorderSize = 1;
            btnManualUndoDeath.FlatAppearance.BorderColor = Color.FromArgb(60, 55, 45);
            btnManualUndoDeath.BackColor = Color.FromArgb(28, 29, 23);
            btnManualUndoDeath.ForeColor = Color.FromArgb(200, 195, 180);
            btnManualUndoDeath.Font = new Font("Segoe UI", 7.5F);
            btnManualUndoDeath.Cursor = Cursors.Hand;
            btnManualUndoDeath.Click += delegate { TriggerAction("undo"); };
            pnlDeath.Controls.Add(btnManualUndoDeath);

            btnManualSetDeath = new Button();
            btnManualSetDeath.Text = "Set...";
            btnManualSetDeath.Location = new Point(118, 76);
            btnManualSetDeath.Size = new Size(44, 26);
            btnManualSetDeath.FlatStyle = FlatStyle.Flat;
            btnManualSetDeath.FlatAppearance.BorderSize = 1;
            btnManualSetDeath.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
            btnManualSetDeath.BackColor = Color.FromArgb(32, 33, 26);
            btnManualSetDeath.ForeColor = Color.FromArgb(200, 166, 93);
            btnManualSetDeath.Font = new Font("Segoe UI", 7.5F);
            btnManualSetDeath.Cursor = Cursors.Hand;
            btnManualSetDeath.Click += delegate { PromptSetCount("death"); };
            pnlDeath.Controls.Add(btnManualSetDeath);

            btnManualResetDeath = new Button();
            btnManualResetDeath.Text = "Reset";
            btnManualResetDeath.Location = new Point(166, 76);
            btnManualResetDeath.Size = new Size(46, 26);
            btnManualResetDeath.FlatStyle = FlatStyle.Flat;
            btnManualResetDeath.FlatAppearance.BorderSize = 1;
            btnManualResetDeath.FlatAppearance.BorderColor = Color.FromArgb(70, 30, 30);
            btnManualResetDeath.BackColor = Color.FromArgb(26, 16, 16);
            btnManualResetDeath.ForeColor = Color.FromArgb(220, 100, 100);
            btnManualResetDeath.Font = new Font("Segoe UI", 7F);
            btnManualResetDeath.Cursor = Cursors.Hand;
            btnManualResetDeath.Click += BtnManualResetDeath_Click;
            pnlDeath.Controls.Add(btnManualResetDeath);

            grpScoreboard.Controls.Add(pnlDeath);

            // Right Box: Boss Slain
            Panel pnlBoss = new Panel();
            pnlBoss.Location = new Point(242, 20);
            pnlBoss.Size = new Size(220, 112);
            pnlBoss.BackColor = Color.FromArgb(16, 17, 14);
            pnlBoss.BorderStyle = BorderStyle.FixedSingle;

            Label lblBossTag = new Label();
            lblBossTag.Text = "BOSS SLAIN";
            lblBossTag.Font = new Font("Georgia", 8.5F, FontStyle.Bold);
            lblBossTag.ForeColor = Color.FromArgb(200, 166, 93);
            lblBossTag.Location = new Point(8, 6);
            lblBossTag.AutoSize = true;
            pnlBoss.Controls.Add(lblBossTag);

            lblBossNumber = new Label();
            lblBossNumber.Text = localBossKills.ToString();
            lblBossNumber.Font = new Font("Georgia", 22F, FontStyle.Bold);
            lblBossNumber.ForeColor = Color.FromArgb(250, 204, 21);
            lblBossNumber.Location = new Point(6, 22);
            lblBossNumber.Size = new Size(204, 34);
            lblBossNumber.Cursor = Cursors.Hand;
            lblBossNumber.Click += delegate { PromptSetCount("boss"); };
            pnlBoss.Controls.Add(lblBossNumber);

            lblBossSub = new Label();
            lblBossSub.Text = localBossKills == 1 ? "1 Boss Defeated" : string.Format("{0} Bosses Defeated", localBossKills);
            lblBossSub.Font = new Font("Segoe UI", 7.5F);
            lblBossSub.ForeColor = Color.FromArgb(145, 140, 125);
            lblBossSub.Location = new Point(8, 56);
            lblBossSub.Size = new Size(204, 16);
            pnlBoss.Controls.Add(lblBossSub);

            btnManualAddBoss = new Button();
            btnManualAddBoss.Text = "+1 Boss";
            btnManualAddBoss.Location = new Point(6, 76);
            btnManualAddBoss.Size = new Size(60, 26);
            btnManualAddBoss.FlatStyle = FlatStyle.Flat;
            btnManualAddBoss.FlatAppearance.BorderSize = 1;
            btnManualAddBoss.FlatAppearance.BorderColor = Color.FromArgb(80, 60, 20);
            btnManualAddBoss.BackColor = Color.FromArgb(42, 34, 16);
            btnManualAddBoss.ForeColor = Color.FromArgb(250, 204, 21);
            btnManualAddBoss.Font = new Font("Segoe UI", 7.5F, FontStyle.Bold);
            btnManualAddBoss.Cursor = Cursors.Hand;
            btnManualAddBoss.Click += delegate { TriggerAction("addBossKill"); };
            pnlBoss.Controls.Add(btnManualAddBoss);

            btnManualUndoBoss = new Button();
            btnManualUndoBoss.Text = "Undo";
            btnManualUndoBoss.Location = new Point(70, 76);
            btnManualUndoBoss.Size = new Size(44, 26);
            btnManualUndoBoss.FlatStyle = FlatStyle.Flat;
            btnManualUndoBoss.FlatAppearance.BorderSize = 1;
            btnManualUndoBoss.FlatAppearance.BorderColor = Color.FromArgb(60, 55, 45);
            btnManualUndoBoss.BackColor = Color.FromArgb(28, 29, 23);
            btnManualUndoBoss.ForeColor = Color.FromArgb(200, 195, 180);
            btnManualUndoBoss.Font = new Font("Segoe UI", 7.5F);
            btnManualUndoBoss.Cursor = Cursors.Hand;
            btnManualUndoBoss.Click += delegate { TriggerAction("undoBossKill"); };
            pnlBoss.Controls.Add(btnManualUndoBoss);

            btnManualSetBoss = new Button();
            btnManualSetBoss.Text = "Set...";
            btnManualSetBoss.Location = new Point(118, 76);
            btnManualSetBoss.Size = new Size(44, 26);
            btnManualSetBoss.FlatStyle = FlatStyle.Flat;
            btnManualSetBoss.FlatAppearance.BorderSize = 1;
            btnManualSetBoss.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
            btnManualSetBoss.BackColor = Color.FromArgb(32, 33, 26);
            btnManualSetBoss.ForeColor = Color.FromArgb(200, 166, 93);
            btnManualSetBoss.Font = new Font("Segoe UI", 7.5F);
            btnManualSetBoss.Cursor = Cursors.Hand;
            btnManualSetBoss.Click += delegate { PromptSetCount("boss"); };
            pnlBoss.Controls.Add(btnManualSetBoss);

            btnManualResetBoss = new Button();
            btnManualResetBoss.Text = "Reset";
            btnManualResetBoss.Location = new Point(166, 76);
            btnManualResetBoss.Size = new Size(46, 26);
            btnManualResetBoss.FlatStyle = FlatStyle.Flat;
            btnManualResetBoss.FlatAppearance.BorderSize = 1;
            btnManualResetBoss.FlatAppearance.BorderColor = Color.FromArgb(70, 30, 30);
            btnManualResetBoss.BackColor = Color.FromArgb(26, 16, 16);
            btnManualResetBoss.ForeColor = Color.FromArgb(220, 100, 100);
            btnManualResetBoss.Font = new Font("Segoe UI", 7F);
            btnManualResetBoss.Cursor = Cursors.Hand;
            btnManualResetBoss.Click += BtnManualResetBoss_Click;
            pnlBoss.Controls.Add(btnManualResetBoss);

            grpScoreboard.Controls.Add(pnlBoss);

            this.Controls.Add(grpScoreboard);

            // ─── Hotkeys Configuration Card ───
            GroupBox grpHotkeys = new GroupBox();
            grpHotkeys.Text = " Configured Hotkeys (Customizable • Works In-Game) ";
            grpHotkeys.Location = new Point(20, 276);
            grpHotkeys.Size = new Size(475, 192);
            grpHotkeys.ForeColor = Color.FromArgb(200, 166, 93);
            grpHotkeys.BackColor = Color.FromArgb(24, 25, 20);

            // Row 1: +1 Death
            Label lblAdd = new Label();
            lblAdd.Text = "+1 Death:";
            lblAdd.Location = new Point(16, 26);
            lblAdd.Size = new Size(95, 20);
            lblAdd.ForeColor = Color.FromArgb(226, 217, 197);
            grpHotkeys.Controls.Add(lblAdd);

            cmbAddKey = new ComboBox();
            cmbAddKey.Location = new Point(115, 23);
            cmbAddKey.Size = new Size(175, 24);
            cmbAddKey.DropDownStyle = ComboBoxStyle.DropDown;
            PopulateKeyOptions(cmbAddKey);
            cmbAddKey.SelectedItem = "F8";
            cmbAddKey.SelectedIndexChanged += delegate {
                if (!isInitializing && cmbAddKey.SelectedItem != null && recordingTarget == null) {
                    string sel = cmbAddKey.SelectedItem.ToString();
                    ApplyBinding("add", HotkeyBinding.FromString(sel, DEFAULT_ADD_KEY, "F8"));
                }
            };
            cmbAddKey.KeyDown += delegate(object s, KeyEventArgs e) {
                if (e.KeyCode == Keys.Enter) {
                    e.SuppressKeyPress = true;
                    if (!isInitializing && !string.IsNullOrEmpty(cmbAddKey.Text) && recordingTarget == null) {
                        ApplyBinding("add", HotkeyBinding.FromString(cmbAddKey.Text, DEFAULT_ADD_KEY, "F8"));
                    }
                }
            };
            cmbAddKey.Leave += delegate {
                if (!isInitializing && !string.IsNullOrEmpty(cmbAddKey.Text) && recordingTarget == null) {
                    ApplyBinding("add", HotkeyBinding.FromString(cmbAddKey.Text, DEFAULT_ADD_KEY, "F8"));
                }
            };
            grpHotkeys.Controls.Add(cmbAddKey);

            btnRecordAdd = CreateRecordButton(new Point(298, 22), "add");
            grpHotkeys.Controls.Add(btnRecordAdd);

            btnClearAdd = CreateClearButton(new Point(404, 22), "add");
            grpHotkeys.Controls.Add(btnClearAdd);

            // Row 2: Undo Death
            Label lblUndo = new Label();
            lblUndo.Text = "Undo Death:";
            lblUndo.Location = new Point(16, 58);
            lblUndo.Size = new Size(95, 20);
            lblUndo.ForeColor = Color.FromArgb(226, 217, 197);
            grpHotkeys.Controls.Add(lblUndo);

            cmbUndoKey = new ComboBox();
            cmbUndoKey.Location = new Point(115, 55);
            cmbUndoKey.Size = new Size(175, 24);
            cmbUndoKey.DropDownStyle = ComboBoxStyle.DropDown;
            PopulateKeyOptions(cmbUndoKey);
            cmbUndoKey.SelectedItem = "F7";
            cmbUndoKey.SelectedIndexChanged += delegate {
                if (!isInitializing && cmbUndoKey.SelectedItem != null && recordingTarget == null) {
                    string sel = cmbUndoKey.SelectedItem.ToString();
                    ApplyBinding("undo", HotkeyBinding.FromString(sel, DEFAULT_UNDO_KEY, "F7"));
                }
            };
            cmbUndoKey.KeyDown += delegate(object s, KeyEventArgs e) {
                if (e.KeyCode == Keys.Enter) {
                    e.SuppressKeyPress = true;
                    if (!isInitializing && !string.IsNullOrEmpty(cmbUndoKey.Text) && recordingTarget == null) {
                        ApplyBinding("undo", HotkeyBinding.FromString(cmbUndoKey.Text, DEFAULT_UNDO_KEY, "F7"));
                    }
                }
            };
            cmbUndoKey.Leave += delegate {
                if (!isInitializing && !string.IsNullOrEmpty(cmbUndoKey.Text) && recordingTarget == null) {
                    ApplyBinding("undo", HotkeyBinding.FromString(cmbUndoKey.Text, DEFAULT_UNDO_KEY, "F7"));
                }
            };
            grpHotkeys.Controls.Add(cmbUndoKey);

            btnRecordUndo = CreateRecordButton(new Point(298, 54), "undo");
            grpHotkeys.Controls.Add(btnRecordUndo);

            btnClearUndo = CreateClearButton(new Point(404, 54), "undo");
            grpHotkeys.Controls.Add(btnClearUndo);

            // Row 3: +1 Boss Slain
            Label lblAddBoss = new Label();
            lblAddBoss.Text = "+1 Boss Slain:";
            lblAddBoss.Location = new Point(16, 90);
            lblAddBoss.Size = new Size(95, 20);
            lblAddBoss.ForeColor = Color.FromArgb(200, 166, 93);
            grpHotkeys.Controls.Add(lblAddBoss);

            cmbAddBossKey = new ComboBox();
            cmbAddBossKey.Location = new Point(115, 87);
            cmbAddBossKey.Size = new Size(175, 24);
            cmbAddBossKey.DropDownStyle = ComboBoxStyle.DropDown;
            PopulateKeyOptions(cmbAddBossKey);
            cmbAddBossKey.SelectedItem = "F9";
            cmbAddBossKey.SelectedIndexChanged += delegate {
                if (!isInitializing && cmbAddBossKey.SelectedItem != null && recordingTarget == null) {
                    string sel = cmbAddBossKey.SelectedItem.ToString();
                    ApplyBinding("addBoss", HotkeyBinding.FromString(sel, DEFAULT_ADD_BOSS_KEY, "F9"));
                }
            };
            cmbAddBossKey.KeyDown += delegate(object s, KeyEventArgs e) {
                if (e.KeyCode == Keys.Enter) {
                    e.SuppressKeyPress = true;
                    if (!isInitializing && !string.IsNullOrEmpty(cmbAddBossKey.Text) && recordingTarget == null) {
                        ApplyBinding("addBoss", HotkeyBinding.FromString(cmbAddBossKey.Text, DEFAULT_ADD_BOSS_KEY, "F9"));
                    }
                }
            };
            cmbAddBossKey.Leave += delegate {
                if (!isInitializing && !string.IsNullOrEmpty(cmbAddBossKey.Text) && recordingTarget == null) {
                    ApplyBinding("addBoss", HotkeyBinding.FromString(cmbAddBossKey.Text, DEFAULT_ADD_BOSS_KEY, "F9"));
                }
            };
            grpHotkeys.Controls.Add(cmbAddBossKey);

            btnRecordAddBoss = CreateRecordButton(new Point(298, 86), "addBoss");
            grpHotkeys.Controls.Add(btnRecordAddBoss);

            btnClearAddBoss = CreateClearButton(new Point(404, 86), "addBoss");
            grpHotkeys.Controls.Add(btnClearAddBoss);

            // Row 4: Undo Boss Slain
            Label lblUndoBoss = new Label();
            lblUndoBoss.Text = "Undo Boss:";
            lblUndoBoss.Location = new Point(16, 122);
            lblUndoBoss.Size = new Size(95, 20);
            lblUndoBoss.ForeColor = Color.FromArgb(226, 217, 197);
            grpHotkeys.Controls.Add(lblUndoBoss);

            cmbUndoBossKey = new ComboBox();
            cmbUndoBossKey.Location = new Point(115, 119);
            cmbUndoBossKey.Size = new Size(175, 24);
            cmbUndoBossKey.DropDownStyle = ComboBoxStyle.DropDown;
            PopulateKeyOptions(cmbUndoBossKey);
            cmbUndoBossKey.SelectedItem = "F10";
            cmbUndoBossKey.SelectedIndexChanged += delegate {
                if (!isInitializing && cmbUndoBossKey.SelectedItem != null && recordingTarget == null) {
                    string sel = cmbUndoBossKey.SelectedItem.ToString();
                    ApplyBinding("undoBoss", HotkeyBinding.FromString(sel, DEFAULT_UNDO_BOSS_KEY, "F10"));
                }
            };
            cmbUndoBossKey.KeyDown += delegate(object s, KeyEventArgs e) {
                if (e.KeyCode == Keys.Enter) {
                    e.SuppressKeyPress = true;
                    if (!isInitializing && !string.IsNullOrEmpty(cmbUndoBossKey.Text) && recordingTarget == null) {
                        ApplyBinding("undoBoss", HotkeyBinding.FromString(cmbUndoBossKey.Text, DEFAULT_UNDO_BOSS_KEY, "F10"));
                    }
                }
            };
            cmbUndoBossKey.Leave += delegate {
                if (!isInitializing && !string.IsNullOrEmpty(cmbUndoBossKey.Text) && recordingTarget == null) {
                    ApplyBinding("undoBoss", HotkeyBinding.FromString(cmbUndoBossKey.Text, DEFAULT_UNDO_BOSS_KEY, "F10"));
                }
            };
            grpHotkeys.Controls.Add(cmbUndoBossKey);

            btnRecordUndoBoss = CreateRecordButton(new Point(298, 118), "undoBoss");
            grpHotkeys.Controls.Add(btnRecordUndoBoss);

            btnClearUndoBoss = CreateClearButton(new Point(404, 118), "undoBoss");
            grpHotkeys.Controls.Add(btnClearUndoBoss);

            Label lblRecHelp = new Label();
            lblRecHelp.Text = "Supports combinations (Ctrl+, Alt+, Shift+) • Select 'Not Configured' or click [Clear] to disable.";
            lblRecHelp.Location = new Point(16, 156);
            lblRecHelp.Size = new Size(445, 24);
            lblRecHelp.Font = new Font("Segoe UI", 7.8F);
            lblRecHelp.ForeColor = Color.FromArgb(145, 140, 125);
            grpHotkeys.Controls.Add(lblRecHelp);

            this.Controls.Add(grpHotkeys);

            // ─── Streamer Account Card (Mandatory Sign-In) ───
            grpAccount = new GroupBox();
            grpAccount.Text = " ✦ Streamer Cloud Account (Sign-In Mandatory) ";
            grpAccount.Location = new Point(20, 476);
            grpAccount.Size = new Size(475, 116);
            grpAccount.ForeColor = Color.FromArgb(200, 166, 93);
            grpAccount.BackColor = Color.FromArgb(24, 25, 20);

            lblAccountStatus = new Label();
            lblAccountStatus.Text = "⚠ Sign-In Required: Sign in to activate hotkeys & OBS sync";
            lblAccountStatus.Location = new Point(16, 22);
            lblAccountStatus.Size = new Size(445, 20);
            lblAccountStatus.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
            lblAccountStatus.ForeColor = Color.FromArgb(248, 113, 113);
            grpAccount.Controls.Add(lblAccountStatus);

            btnGoogleSignIn = new Button();
            btnGoogleSignIn.Text = "✦ Sign in with Google";
            btnGoogleSignIn.Location = new Point(16, 46);
            btnGoogleSignIn.Size = new Size(160, 28);
            btnGoogleSignIn.FlatStyle = FlatStyle.Flat;
            btnGoogleSignIn.FlatAppearance.BorderSize = 1;
            btnGoogleSignIn.FlatAppearance.BorderColor = Color.FromArgb(200, 166, 93);
            btnGoogleSignIn.BackColor = Color.FromArgb(42, 34, 16);
            btnGoogleSignIn.ForeColor = Color.FromArgb(250, 204, 21);
            btnGoogleSignIn.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
            btnGoogleSignIn.Cursor = Cursors.Hand;
            btnGoogleSignIn.Click += BtnGoogleSignIn_Click;
            grpAccount.Controls.Add(btnGoogleSignIn);

            btnSignOut = new Button();
            btnSignOut.Text = "Sign Out";
            btnSignOut.Location = new Point(182, 46);
            btnSignOut.Size = new Size(74, 28);
            btnSignOut.FlatStyle = FlatStyle.Flat;
            btnSignOut.FlatAppearance.BorderSize = 1;
            btnSignOut.FlatAppearance.BorderColor = Color.FromArgb(70, 30, 30);
            btnSignOut.BackColor = Color.FromArgb(26, 16, 16);
            btnSignOut.ForeColor = Color.FromArgb(220, 100, 100);
            btnSignOut.Font = new Font("Segoe UI", 7.5F);
            btnSignOut.Cursor = Cursors.Hand;
            btnSignOut.Click += BtnSignOut_Click;
            btnSignOut.Visible = false;
            grpAccount.Controls.Add(btnSignOut);

            lblKeyTag = new Label();
            lblKeyTag.Text = "Streamer Key:";
            lblKeyTag.Location = new Point(16, 83);
            lblKeyTag.AutoSize = true;
            lblKeyTag.ForeColor = Color.FromArgb(145, 140, 125);
            lblKeyTag.Font = new Font("Segoe UI", 8F);
            grpAccount.Controls.Add(lblKeyTag);

            txtStreamerKey = new TextBox();
            txtStreamerKey.Location = new Point(102, 80);
            txtStreamerKey.Size = new Size(210, 24);
            txtStreamerKey.BackColor = Color.FromArgb(14, 15, 12);
            txtStreamerKey.ForeColor = Color.FromArgb(200, 166, 93);
            txtStreamerKey.BorderStyle = BorderStyle.FixedSingle;
            txtStreamerKey.Font = new Font("Consolas", 8.5F);
            grpAccount.Controls.Add(txtStreamerKey);

            btnPasteKey = new Button();
            btnPasteKey.Text = "Paste";
            btnPasteKey.Location = new Point(318, 79);
            btnPasteKey.Size = new Size(62, 26);
            btnPasteKey.FlatStyle = FlatStyle.Flat;
            btnPasteKey.FlatAppearance.BorderSize = 1;
            btnPasteKey.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
            btnPasteKey.BackColor = Color.FromArgb(28, 29, 23);
            btnPasteKey.ForeColor = Color.FromArgb(200, 166, 93);
            btnPasteKey.Cursor = Cursors.Hand;
            btnPasteKey.Click += delegate {
                try {
                    string clip = Clipboard.GetText();
                    if (!string.IsNullOrEmpty(clip)) {
                        txtStreamerKey.Text = clip.Trim();
                        BtnConnectKey_Click(btnConnectKey, EventArgs.Empty);
                    }
                } catch {}
            };
            grpAccount.Controls.Add(btnPasteKey);

            btnConnectKey = new Button();
            btnConnectKey.Text = "Connect";
            btnConnectKey.Location = new Point(386, 79);
            btnConnectKey.Size = new Size(74, 26);
            btnConnectKey.FlatStyle = FlatStyle.Flat;
            btnConnectKey.FlatAppearance.BorderSize = 1;
            btnConnectKey.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
            btnConnectKey.BackColor = Color.FromArgb(32, 33, 26);
            btnConnectKey.ForeColor = Color.FromArgb(200, 166, 93);
            btnConnectKey.Cursor = Cursors.Hand;
            btnConnectKey.Click += BtnConnectKey_Click;
            grpAccount.Controls.Add(btnConnectKey);

            this.Controls.Add(grpAccount);

            // ─── Server URL Connection Card ───
            GroupBox grpServer = new GroupBox();
            grpServer.Text = " Overlay Server Connection ";
            grpServer.Location = new Point(20, 600);
            grpServer.Size = new Size(475, 78);
            grpServer.ForeColor = Color.FromArgb(200, 166, 93);
            grpServer.BackColor = Color.FromArgb(24, 25, 20);

            Label lblServer = new Label();
            lblServer.Text = "Server URL:";
            lblServer.Location = new Point(16, 22);
            lblServer.AutoSize = true;
            lblServer.ForeColor = Color.FromArgb(226, 217, 197);
            grpServer.Controls.Add(lblServer);

            txtServerUrl = new TextBox();
            txtServerUrl.Location = new Point(95, 19);
            txtServerUrl.Size = new Size(275, 24);
            txtServerUrl.BackColor = Color.FromArgb(14, 15, 12);
            txtServerUrl.ForeColor = Color.FromArgb(200, 166, 93);
            txtServerUrl.BorderStyle = BorderStyle.FixedSingle;
            txtServerUrl.Text = serverUrl;
            txtServerUrl.TextChanged += delegate {
                string raw = txtServerUrl.Text.Trim();
                if (!isInitializing && !string.IsNullOrEmpty(raw)) {
                    serverUrl = raw.TrimEnd('/');
                    SaveConfig();
                }
            };
            grpServer.Controls.Add(txtServerUrl);

            btnTestConnection = new Button();
            btnTestConnection.Text = "Ping Server";
            btnTestConnection.Location = new Point(378, 18);
            btnTestConnection.Size = new Size(82, 26);
            btnTestConnection.FlatStyle = FlatStyle.Flat;
            btnTestConnection.FlatAppearance.BorderSize = 1;
            btnTestConnection.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
            btnTestConnection.BackColor = Color.FromArgb(32, 33, 26);
            btnTestConnection.ForeColor = Color.FromArgb(200, 166, 93);
            btnTestConnection.Cursor = Cursors.Hand;
            btnTestConnection.Click += delegate { TestConnectionAsync(); };
            grpServer.Controls.Add(btnTestConnection);

            lblServerPing = new Label();
            lblServerPing.Text = "Checking connection...";
            lblServerPing.Location = new Point(95, 48);
            lblServerPing.Size = new Size(365, 20);
            lblServerPing.Font = new Font("Segoe UI", 8F);
            lblServerPing.ForeColor = Color.FromArgb(145, 140, 125);
            grpServer.Controls.Add(lblServerPing);

            this.Controls.Add(grpServer);

            // ─── Live Activity Log ───
            Label lblLog = new Label();
            lblLog.Text = "Live Activity & Keystroke Monitor:";
            lblLog.Location = new Point(20, 686);
            lblLog.AutoSize = true;
            lblLog.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            lblLog.ForeColor = Color.FromArgb(160, 155, 140);
            this.Controls.Add(lblLog);

            txtActivityLog = new TextBox();
            txtActivityLog.Location = new Point(20, 708);
            txtActivityLog.Size = new Size(475, 136);
            txtActivityLog.Multiline = true;
            txtActivityLog.ReadOnly = true;
            txtActivityLog.ScrollBars = ScrollBars.Vertical;
            txtActivityLog.BackColor = Color.FromArgb(10, 11, 9);
            txtActivityLog.ForeColor = Color.FromArgb(200, 166, 93);
            txtActivityLog.BorderStyle = BorderStyle.FixedSingle;
            txtActivityLog.Font = new Font("Consolas", 8.5F);
            this.Controls.Add(txtActivityLog);

            // ─── Footer / Minimize Checkbox ───
            chkMinimizeToTray = new CheckBox();
            chkMinimizeToTray.Text = "Minimize to System Tray when closed (keeps running in background)";
            chkMinimizeToTray.Location = new Point(22, 852);
            chkMinimizeToTray.AutoSize = true;
            chkMinimizeToTray.ForeColor = Color.FromArgb(145, 140, 125);
            chkMinimizeToTray.Checked = true;
            this.Controls.Add(chkMinimizeToTray);

            // ─── System Tray Icon ───
            trayIcon = new NotifyIcon();
            trayIcon.Text = "Souls Game Death & Boss Counter";
            trayIcon.Icon = this.Icon ?? SystemIcons.Application;
            trayIcon.Visible = false;
            trayIcon.DoubleClick += delegate {
                this.Show();
                this.WindowState = FormWindowState.Normal;
                this.BringToFront();
                trayIcon.Visible = false;
            };

            ContextMenu trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("Open Window", delegate {
                this.Show();
                this.WindowState = FormWindowState.Normal;
                trayIcon.Visible = false;
            });
            trayMenu.MenuItems.Add("Toggle Hotkeys", delegate { BtnToggle_Click(null, null); });
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Exit App", delegate {
                trayIcon.Visible = false;
                Application.Exit();
            });
            trayIcon.ContextMenu = trayMenu;

            this.FormClosing += HotkeyAppForm_FormClosing;
        }

        private Button CreateRecordButton(Point loc, string target) {
            Button btn = new Button();
            btn.Text = "Record Key";
            btn.Location = loc;
            btn.Size = new Size(100, 26);
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderSize = 1;
            btn.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
            btn.BackColor = Color.FromArgb(32, 33, 26);
            btn.ForeColor = Color.FromArgb(226, 217, 197);
            btn.Font = new Font("Segoe UI", 8F);
            btn.Cursor = Cursors.Hand;
            btn.Click += delegate { StartKeyRecording(target, btn); };
            return btn;
        }

        private Button CreateClearButton(Point loc, string target) {
            Button btn = new Button();
            btn.Text = "Clear";
            btn.Location = loc;
            btn.Size = new Size(56, 26);
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderSize = 1;
            btn.FlatAppearance.BorderColor = Color.FromArgb(74, 40, 40);
            btn.BackColor = Color.FromArgb(28, 18, 18);
            btn.ForeColor = Color.FromArgb(248, 113, 113);
            btn.Font = new Font("Segoe UI", 7.5F, FontStyle.Bold);
            btn.Cursor = Cursors.Hand;
            btn.Click += delegate {
                ApplyBinding(target, HotkeyBinding.NotConfigured());
            };
            return btn;
        }

        private void StartKeyRecording(string target, Button btn) {
            if (recordingTarget == target) {
                // Cancel recording
                CancelKeyRecording();
                return;
            }

            CancelKeyRecording();
            recordingTarget = target;
            btn.Text = "Press combo...";
            btn.BackColor = Color.FromArgb(70, 48, 12);
            btn.ForeColor = Color.FromArgb(250, 204, 21);
            btn.FlatAppearance.BorderColor = Color.FromArgb(250, 204, 21);
            LogActivity("Press ANY key or combination (e.g. Ctrl+F8, Alt+F8) for: " + target + " (Esc to cancel, Del/Backspace to clear)");
        }

        private void CancelKeyRecording() {
            recordingTarget = null;
            isCtrlHeld = false;
            isAltHeld = false;
            isShiftHeld = false;
            isWinHeld = false;
            if (btnRecordAdd != null) ResetRecordBtn(btnRecordAdd);
            if (btnRecordUndo != null) ResetRecordBtn(btnRecordUndo);
            if (btnRecordAddBoss != null) ResetRecordBtn(btnRecordAddBoss);
            if (btnRecordUndoBoss != null) ResetRecordBtn(btnRecordUndoBoss);
        }

        private void ResetRecordBtn(Button btn) {
            btn.Text = "Record Key";
            btn.BackColor = Color.FromArgb(32, 33, 26);
            btn.ForeColor = Color.FromArgb(226, 217, 197);
            btn.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
        }

        private void UpdateRecordingButtonPrompt(string prompt) {
            Button btn = null;
            if (recordingTarget == "add") btn = btnRecordAdd;
            else if (recordingTarget == "undo") btn = btnRecordUndo;
            else if (recordingTarget == "addBoss") btn = btnRecordAddBoss;
            else if (recordingTarget == "undoBoss") btn = btnRecordUndoBoss;

            if (btn != null) {
                btn.Text = prompt;
            }
        }

        private static string GetActiveModifiersPrompt() {
            bool c = isCtrlHeld || IsCtrlDown();
            bool a = isAltHeld || IsAltDown();
            bool s = isShiftHeld || IsShiftDown();
            bool w = isWinHeld || IsWinDown();
            List<string> parts = new List<string>();
            if (c) parts.Add("Ctrl");
            if (a) parts.Add("Alt");
            if (s) parts.Add("Shift");
            if (w) parts.Add("Win");
            if (parts.Count == 0) return "Press combo...";
            parts.Add("...");
            return string.Join(" + ", parts.ToArray());
        }

        private void SafeInvoke(MethodInvoker action) {
            try {
                if (this.IsDisposed) return;
                if (this.IsHandleCreated) {
                    this.BeginInvoke(action);
                } else {
                    action();
                }
            } catch {}
        }

        private void OnCustomBindingCaptured(HotkeyBinding binding) {
            SafeInvoke(delegate {
                string target = recordingTarget;
                CancelKeyRecording();
                ApplyBinding(target, binding);
            });
        }

        private void ApplyBinding(string target, HotkeyBinding newBinding) {
            if (newBinding != null && newBinding.IsConfigured) {
                // Avoid assigning the same key for 2 options
                if (target != "add" && bindingAdd != null && bindingAdd.IsConfigured && BindingsEqual(bindingAdd, newBinding)) {
                    bindingAdd = HotkeyBinding.NotConfigured();
                    if (cmbAddKey != null) cmbAddKey.SelectedItem = "Not Configured";
                    LogActivity("+1 Death reset to Not Configured (avoid duplicate key with " + GetTargetLabel(target) + ")");
                }
                if (target != "undo" && bindingUndo != null && bindingUndo.IsConfigured && BindingsEqual(bindingUndo, newBinding)) {
                    bindingUndo = HotkeyBinding.NotConfigured();
                    if (cmbUndoKey != null) cmbUndoKey.SelectedItem = "Not Configured";
                    LogActivity("Undo Death reset to Not Configured (avoid duplicate key with " + GetTargetLabel(target) + ")");
                }
                if (target != "addBoss" && bindingAddBoss != null && bindingAddBoss.IsConfigured && BindingsEqual(bindingAddBoss, newBinding)) {
                    bindingAddBoss = HotkeyBinding.NotConfigured();
                    if (cmbAddBossKey != null) cmbAddBossKey.SelectedItem = "Not Configured";
                    LogActivity("+1 Boss Slain reset to Not Configured (avoid duplicate key with " + GetTargetLabel(target) + ")");
                }
                if (target != "undoBoss" && bindingUndoBoss != null && bindingUndoBoss.IsConfigured && BindingsEqual(bindingUndoBoss, newBinding)) {
                    bindingUndoBoss = HotkeyBinding.NotConfigured();
                    if (cmbUndoBossKey != null) cmbUndoBossKey.SelectedItem = "Not Configured";
                    LogActivity("Undo Boss reset to Not Configured (avoid duplicate key with " + GetTargetLabel(target) + ")");
                }
            }

            if (target == "add") {
                bindingAdd = newBinding;
                EnsureKeyInCombo(cmbAddKey, newBinding.DisplayName);
                if (cmbAddKey != null) cmbAddKey.SelectedItem = newBinding.DisplayName;
                LogActivity("+1 Death hotkey set to: " + newBinding.DisplayName + (newBinding.IsConfigured ? "" : " (Disabled)"));
            } else if (target == "undo") {
                bindingUndo = newBinding;
                EnsureKeyInCombo(cmbUndoKey, newBinding.DisplayName);
                if (cmbUndoKey != null) cmbUndoKey.SelectedItem = newBinding.DisplayName;
                LogActivity("Undo Death hotkey set to: " + newBinding.DisplayName + (newBinding.IsConfigured ? "" : " (Disabled)"));
            } else if (target == "addBoss") {
                bindingAddBoss = newBinding;
                EnsureKeyInCombo(cmbAddBossKey, newBinding.DisplayName);
                if (cmbAddBossKey != null) cmbAddBossKey.SelectedItem = newBinding.DisplayName;
                LogActivity("+1 Boss Slain hotkey set to: " + newBinding.DisplayName + (newBinding.IsConfigured ? "" : " (Disabled)"));
            } else if (target == "undoBoss") {
                bindingUndoBoss = newBinding;
                EnsureKeyInCombo(cmbUndoBossKey, newBinding.DisplayName);
                if (cmbUndoBossKey != null) cmbUndoBossKey.SelectedItem = newBinding.DisplayName;
                LogActivity("Undo Boss Slain hotkey set to: " + newBinding.DisplayName + (newBinding.IsConfigured ? "" : " (Disabled)"));
            }

            SaveConfig();
        }

        private static bool BindingsEqual(HotkeyBinding a, HotkeyBinding b) {
            if (a == null || b == null) return false;
            if (!a.IsConfigured || !b.IsConfigured) return false;
            return a.KeyVk == b.KeyVk && a.Ctrl == b.Ctrl && a.Alt == b.Alt && a.Shift == b.Shift && a.Win == b.Win;
        }

        private static string GetTargetLabel(string target) {
            if (target == "add") return "+1 Death";
            if (target == "undo") return "Undo Death";
            if (target == "addBoss") return "+1 Boss Slain";
            if (target == "undoBoss") return "Undo Boss";
            return target;
        }

        private void EnsureKeyInCombo(ComboBox cmb, string keyName) {
            if (cmb != null && !string.IsNullOrEmpty(keyName)) {
                for (int i = 0; i < cmb.Items.Count; i++) {
                    if (string.Equals(cmb.Items[i].ToString(), keyName, StringComparison.OrdinalIgnoreCase)) {
                        return;
                    }
                }
                cmb.Items.Insert(1, keyName); // Place after "Not Configured"
            }
        }

        private void PopulateKeyOptions(ComboBox cmb) {
            cmb.Items.Add("Not Configured");

            // Standard Function Keys
            for (int i = 1; i <= 12; i++) {
                cmb.Items.Add("F" + i);
            }

            // Ctrl + Function Keys
            for (int i = 1; i <= 12; i++) {
                cmb.Items.Add("Ctrl + F" + i);
            }

            // Alt + Function Keys
            for (int i = 1; i <= 12; i++) {
                cmb.Items.Add("Alt + F" + i);
            }

            // Shift + Function Keys
            for (int i = 1; i <= 12; i++) {
                cmb.Items.Add("Shift + F" + i);
            }

            // Popular Ctrl + Alt combos
            cmb.Items.Add("Ctrl + Alt + F7");
            cmb.Items.Add("Ctrl + Alt + F8");
            cmb.Items.Add("Ctrl + Alt + F9");
            cmb.Items.Add("Ctrl + Alt + F10");
            cmb.Items.Add("Ctrl + Alt + D");
            cmb.Items.Add("Ctrl + Alt + B");

            // Popular Ctrl + Letter/Digit combos
            cmb.Items.Add("Ctrl + D");
            cmb.Items.Add("Ctrl + B");
            cmb.Items.Add("Ctrl + K");
            cmb.Items.Add("Ctrl + 1");
            cmb.Items.Add("Ctrl + 2");
            cmb.Items.Add("Ctrl + 3");
            cmb.Items.Add("Ctrl + 4");
            cmb.Items.Add("Ctrl + 5");

            // Popular Alt + Letter/Digit combos
            cmb.Items.Add("Alt + D");
            cmb.Items.Add("Alt + B");
            cmb.Items.Add("Alt + 1");
            cmb.Items.Add("Alt + 2");
            cmb.Items.Add("Alt + 3");
            cmb.Items.Add("Alt + 4");
            cmb.Items.Add("Alt + 5");

            // Numpad Keys & combos
            cmb.Items.Add("NumPadAdd");
            cmb.Items.Add("NumPadSubtract");
            cmb.Items.Add("NumPadMultiply");
            cmb.Items.Add("NumPadDivide");
            cmb.Items.Add("Ctrl + NumPadAdd");
            cmb.Items.Add("Ctrl + NumPadSubtract");
            cmb.Items.Add("Alt + NumPadAdd");
            cmb.Items.Add("Alt + NumPadSubtract");
            for (int i = 0; i <= 9; i++) {
                cmb.Items.Add("NumPad" + i);
            }

            // Other keys
            cmb.Items.Add("Insert");
            cmb.Items.Add("Delete");
            cmb.Items.Add("Home");
            cmb.Items.Add("End");
            cmb.Items.Add("PageUp");
            cmb.Items.Add("PageDown");
        }

        private void BtnGoogleSignIn_Click(object sender, EventArgs e) {
            try {
                string baseEndpoint = serverUrl.TrimEnd('/');
                string target = baseEndpoint + "/controller";
                Process.Start(target);
                LogActivity("✦ Opening browser for Streamer Sign-In: " + target);
                LogActivity("✦ Sign in on the page, then copy your Streamer Key here or click Paste!");
            } catch (Exception ex) {
                MessageBox.Show("Could not open browser: " + ex.Message, "Sign In Required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void BtnSignOut_Click(object sender, EventArgs e) {
            streamerKey = "";
            userDisplayName = "";
            userEmail = "";
            isUserSignedIn = false;
            lock (stateLock) {
                localDeaths = 0;
                localSessionDeaths = 0;
                localAllTimeDeaths = 0;
                localBossKills = 0;
                localLastUpdated = 0;
                SaveLocalState();
            }
            SaveConfig();
            UpdateAccountUI();
            UpdateCountersUI();
            LogActivity("Signed out. App is locked: Sign in is mandatory to use hotkeys.");
        }

        private void BtnConnectKey_Click(object sender, EventArgs e) {
            if (txtStreamerKey == null) return;
            string key = txtStreamerKey.Text.Trim();
            if (string.IsNullOrEmpty(key) || key.Equals("guest", StringComparison.OrdinalIgnoreCase)) {
                BtnSignOut_Click(sender, e);
                return;
            }

            streamerKey = key;
            if (string.IsNullOrEmpty(userDisplayName) || userDisplayName == "guest") {
                userDisplayName = key;
            }
            isUserSignedIn = true;
            SaveConfig();
            UpdateAccountUI();
            LogActivity("✦ Linked Streamer Key: " + streamerKey + ". Fetching cloud state...");
            TestConnectionAsync();
        }

        private void UpdateAccountUI() {
            SafeInvoke(delegate {
                if (lblAccountStatus != null && !lblAccountStatus.IsDisposed) {
                    if (IsAuthenticated) {
                        string name = !string.IsNullOrEmpty(userDisplayName) ? userDisplayName : streamerKey;
                        lblAccountStatus.Text = "● Signed In: " + name + " (Cloud Active • Hotkeys Enabled)";
                        lblAccountStatus.ForeColor = Color.FromArgb(74, 222, 128);
                        if (btnSignOut != null) {
                            btnSignOut.Visible = true;
                            btnSignOut.Enabled = true;
                            btnSignOut.Text = "Sign Out";
                        }
                        if (btnGoogleSignIn != null) {
                            btnGoogleSignIn.Text = "Switch Account";
                        }
                    } else {
                        lblAccountStatus.Text = "⚠ Sign-In Required: Sign in with Google or enter Streamer Key";
                        lblAccountStatus.ForeColor = Color.FromArgb(248, 113, 113);
                        if (btnSignOut != null) {
                            btnSignOut.Visible = false;
                            btnSignOut.Enabled = false;
                        }
                        if (btnGoogleSignIn != null) {
                            btnGoogleSignIn.Text = "✦ Sign in with Google";
                        }
                    }
                }
                if (txtStreamerKey != null && !txtStreamerKey.IsDisposed && !txtStreamerKey.Focused) {
                    txtStreamerKey.Text = streamerKey ?? "";
                }
                UpdateUIState();
            });
        }

        private void BtnToggle_Click(object sender, EventArgs e) {
            if (!IsAuthenticated) {
                LogActivity("⚠ Sign-in is mandatory: Please sign in with Google or enter your Streamer Key.");
                BtnGoogleSignIn_Click(sender, e);
                return;
            }
            isHotkeysActive = !isHotkeysActive;
            UpdateUIState();
            SaveConfig();
            LogActivity(isHotkeysActive ? "Hotkeys ACTIVATED. Listening for configured hotkeys." : "Hotkeys PAUSED.");
        }

        private void UpdateUIState() {
            if (!IsAuthenticated) {
                btnToggle.Text = "🔒  SIGN IN REQUIRED  (Click to Sign In with Google)";
                btnToggle.BackColor = Color.FromArgb(42, 34, 16);
                btnToggle.ForeColor = Color.FromArgb(250, 204, 21);
                btnToggle.FlatAppearance.BorderColor = Color.FromArgb(200, 166, 93);
            } else if (isHotkeysActive) {
                btnToggle.Text = "●  HOTKEYS ACTIVE  (Click to Pause)";
                btnToggle.BackColor = Color.FromArgb(20, 48, 26);
                btnToggle.ForeColor = Color.FromArgb(74, 222, 128);
                btnToggle.FlatAppearance.BorderColor = Color.FromArgb(74, 222, 128);
            } else {
                btnToggle.Text = "○  HOTKEYS PAUSED  (Click to Activate)";
                btnToggle.BackColor = Color.FromArgb(48, 20, 20);
                btnToggle.ForeColor = Color.FromArgb(248, 113, 113);
                btnToggle.FlatAppearance.BorderColor = Color.FromArgb(239, 68, 68);
            }

            // Enable or disable manual counter controls based on authentication
            bool auth = IsAuthenticated;
            if (btnManualAddDeath != null) btnManualAddDeath.Enabled = auth;
            if (btnManualUndoDeath != null) btnManualUndoDeath.Enabled = auth;
            if (btnManualSetDeath != null) btnManualSetDeath.Enabled = auth;
            if (btnManualResetDeath != null) btnManualResetDeath.Enabled = auth;
            if (btnManualAddBoss != null) btnManualAddBoss.Enabled = auth;
            if (btnManualUndoBoss != null) btnManualUndoBoss.Enabled = auth;
            if (btnManualSetBoss != null) btnManualSetBoss.Enabled = auth;
            if (btnManualResetBoss != null) btnManualResetBoss.Enabled = auth;
        }

        private static string GetCloudEndpoint(string path) {
            string baseEndpoint = serverUrl.TrimEnd('/') + path;
            string cloudKey = !string.IsNullOrEmpty(streamerKey) && streamerKey != "guest" ? streamerKey : "";
            if (!string.IsNullOrEmpty(cloudKey)) {
                string sep = baseEndpoint.Contains("?") ? "&" : "?";
                return baseEndpoint + sep + "key=" + Uri.EscapeDataString(cloudKey);
            }
            return baseEndpoint;
        }

        private void TestConnectionAsync() {
            if (!IsAuthenticated) {
                SafeInvoke(delegate {
                    if (lblServerPing != null && !lblServerPing.IsDisposed) {
                        lblServerPing.Text = "Sign in required to sync with OBS & Cloud";
                        lblServerPing.ForeColor = Color.FromArgb(248, 113, 113);
                    }
                });
                return;
            }

            if (lblServerPing != null) {
                lblServerPing.Text = "Syncing with cloud [Account: " + streamerKey + "]...";
                lblServerPing.ForeColor = Color.FromArgb(200, 166, 93);
            }

            ThreadPool.QueueUserWorkItem(delegate {
                try {
                    using (WebClient client = new WebClient()) {
                        client.Headers["User-Agent"] = "SoulsDeathCounter/2.0";
                        client.Headers[HttpRequestHeader.ContentType] = "application/json";
                        string endpoint = GetCloudEndpoint("/api/state");
                        string sep = endpoint.Contains("?") ? "&" : "?";
                        endpoint += sep + "_t=" + DateTime.UtcNow.Ticks;
                        string json = client.DownloadString(endpoint);
                        Match mDeaths = Regex.Match(json, @"""deaths""\s*:\s*(\d+)");
                        Match mBoss = Regex.Match(json, @"""bossKills""\s*:\s*(\d+)");
                        Match mSession = Regex.Match(json, @"""sessionDeaths""\s*:\s*(\d+)");
                        Match mAllTime = Regex.Match(json, @"""allTimeDeaths""\s*:\s*(\d+)");
                        Match mTime = Regex.Match(json, @"""lastUpdated""\s*:\s*(\d+)");

                        int srvDeaths = mDeaths.Success ? int.Parse(mDeaths.Groups[1].Value) : 0;
                        int srvBoss = mBoss.Success ? int.Parse(mBoss.Groups[1].Value) : 0;
                        int srvSession = mSession.Success ? int.Parse(mSession.Groups[1].Value) : 0;
                        int srvAllTime = mAllTime.Success ? int.Parse(mAllTime.Groups[1].Value) : 0;
                        long srvTime = mTime.Success ? long.Parse(mTime.Groups[1].Value) : 0;

                        lock (stateLock) {
                            localDeaths = srvDeaths;
                            localBossKills = srvBoss;
                            localSessionDeaths = srvSession;
                            localAllTimeDeaths = srvAllTime;
                            localLastUpdated = srvTime > 0 ? srvTime : GetCurrentTimestampMs();
                            SaveLocalState();
                        }

                        SafeInvoke(delegate {
                            UpdateStatusDisplay(srvDeaths, srvBoss);
                            LogActivity(string.Format("✦ Cloud synced: {0} Deaths, {1} Boss Kills", srvDeaths, srvBoss));
                        });
                    }
                } catch (Exception ex) {
                    SafeInvoke(delegate {
                        if (lblServerPing != null && !lblServerPing.IsDisposed) {
                            lblServerPing.Text = "Connection notice: " + ex.Message;
                            lblServerPing.ForeColor = Color.FromArgb(248, 113, 113);
                        }
                    });
                }
            });
        }

        public void LogActivity(string msg) {
            try {
                if (txtActivityLog == null || txtActivityLog.IsDisposed) return;
                if (txtActivityLog.InvokeRequired) {
                    if (txtActivityLog.IsHandleCreated) {
                        txtActivityLog.BeginInvoke((MethodInvoker)delegate { LogActivity(msg); });
                    }
                    return;
                }
                string time = DateTime.Now.ToString("HH:mm:ss");
                txtActivityLog.AppendText("[" + time + "] " + msg + Environment.NewLine);
            } catch {}
        }

        private void HotkeyAppForm_FormClosing(object sender, FormClosingEventArgs e) {
            if (chkMinimizeToTray.Checked && e.CloseReason == CloseReason.UserClosing) {
                e.Cancel = true;
                this.Hide();
                trayIcon.Visible = true;
                trayIcon.ShowBalloonTip(2000, "Death Counter Running", "Hotkeys are still active in Souls games! Double click to open.", ToolTipIcon.Info);
            } else {
                if (hookId != IntPtr.Zero) {
                    UnhookWindowsHookEx(hookId);
                }
                StopLocalHttpServer();
                trayIcon.Visible = false;
            }
        }

        // ─── Keyboard Hook & Asynchronous Polling ───
        private void InstallHook() {
            hookProc = HookCallback;
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule) {
                hookId = SetWindowsHookEx(WH_KEYBOARD_LL, hookProc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (nCode >= 0) {
                int msg = wParam.ToInt32();
                bool isDown = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN);
                bool isUp = (msg == WM_KEYUP || msg == WM_SYSKEYUP);

                if (isDown || isUp) {
                    int vkCode = Marshal.ReadInt32(lParam);

                    // Track active modifiers directly from hook
                    if (vkCode == 0x11 || vkCode == 0xA2 || vkCode == 0xA3) {
                        isCtrlHeld = isDown;
                    } else if (vkCode == 0x12 || vkCode == 0xA4 || vkCode == 0xA5) {
                        isAltHeld = isDown;
                    } else if (vkCode == 0x10 || vkCode == 0xA0 || vkCode == 0xA1) {
                        isShiftHeld = isDown;
                    } else if (vkCode == 0x5B || vkCode == 0x5C) {
                        isWinHeld = isDown;
                    }

                    // If currently capturing custom hotkey
                    if (recordingTarget != null) {
                        if (isDown) {
                            if (vkCode == 0x1B) { // Escape: cancel
                                if (instance != null) {
                                    instance.SafeInvoke(delegate {
                                        instance.CancelKeyRecording();
                                        instance.LogActivity("Key recording cancelled.");
                                    });
                                }
                                return (IntPtr)1;
                            }

                            if (vkCode == 0x08 || vkCode == 0x2E) { // Backspace or Delete: Not Configured
                                if (instance != null) {
                                    instance.SafeInvoke(delegate {
                                        instance.OnCustomBindingCaptured(HotkeyBinding.NotConfigured());
                                    });
                                }
                                return (IntPtr)1;
                            }

                            if (IsModifierVk(vkCode)) {
                                string prompt = GetActiveModifiersPrompt();
                                if (instance != null) {
                                    instance.SafeInvoke(delegate {
                                        instance.UpdateRecordingButtonPrompt(prompt);
                                    });
                                }
                                return CallNextHookEx(hookId, nCode, wParam, lParam);
                            }

                            // Base key pressed!
                            bool ctrl = isCtrlHeld || IsCtrlDown();
                            bool alt = isAltHeld || IsAltDown();
                            bool shift = isShiftHeld || IsShiftDown();
                            bool win = isWinHeld || IsWinDown();
                            string baseName = HotkeyBinding.FormatBaseKeyName((Keys)vkCode, vkCode);
                            HotkeyBinding binding = HotkeyBinding.Create(vkCode, ctrl, alt, shift, win, baseName);

                            if (instance != null) {
                                instance.SafeInvoke(delegate {
                                    instance.OnCustomBindingCaptured(binding);
                                });
                            }
                            return (IntPtr)1;
                        } else if (isUp) {
                            if (IsModifierVk(vkCode)) {
                                string prompt = GetActiveModifiersPrompt();
                                if (instance != null) {
                                    instance.SafeInvoke(delegate {
                                        instance.UpdateRecordingButtonPrompt(prompt);
                                    });
                                }
                                return CallNextHookEx(hookId, nCode, wParam, lParam);
                            }
                        }
                    }

                    if (isHotkeysActive) {
                        CheckHookBinding(bindingAdd, vkCode, isDown, isUp, ref isAddKeyDown, "add");
                        CheckHookBinding(bindingUndo, vkCode, isDown, isUp, ref isUndoKeyDown, "undo");
                        CheckHookBinding(bindingAddBoss, vkCode, isDown, isUp, ref isAddBossKeyDown, "addBossKill");
                        CheckHookBinding(bindingUndoBoss, vkCode, isDown, isUp, ref isUndoBossKeyDown, "undoBossKill");
                    }
                }
            }
            return CallNextHookEx(hookId, nCode, wParam, lParam);
        }

        private static void CheckHookBinding(HotkeyBinding binding, int vkCode, bool isDown, bool isUp, ref bool isKeyDown, string action) {
            if (binding == null || !binding.IsConfigured) return;

            if (vkCode == binding.KeyVk) {
                if (isDown) {
                    if (binding.MatchesModifiers()) {
                        if (!isKeyDown) {
                            isKeyDown = true;
                            if (!IsAuthenticated) {
                                if (instance != null) {
                                    instance.SafeInvoke(delegate {
                                        instance.LogActivity("⚠ Hotkeys locked: Sign-in is mandatory. Please sign in to record deaths.");
                                    });
                                }
                                return;
                            }
                            TriggerAction(action);
                        }
                    }
                } else if (isUp) {
                    isKeyDown = false;
                }
            }
        }

        private void StartAsyncPolling() {
            Thread asyncThread = new Thread(new ThreadStart(AsyncPollingLoop));
            asyncThread.IsBackground = true;
            asyncThread.Start();
        }

        private static void AsyncPollingLoop() {
            while (true) {
                Thread.Sleep(20);

                if (!isHotkeysActive || !IsAuthenticated || recordingTarget != null) continue;

                CheckPollingBinding(bindingAdd, ref isAddKeyDown, "add");
                CheckPollingBinding(bindingUndo, ref isUndoKeyDown, "undo");
                CheckPollingBinding(bindingAddBoss, ref isAddBossKeyDown, "addBossKill");
                CheckPollingBinding(bindingUndoBoss, ref isUndoBossKeyDown, "undoBossKill");
            }
        }

        private static void CheckPollingBinding(HotkeyBinding binding, ref bool isKeyDown, string action) {
            if (binding == null || !binding.IsConfigured) {
                isKeyDown = false;
                return;
            }

            bool baseDown = (GetAsyncKeyState(binding.KeyVk) & 0x8000) != 0;
            if (baseDown && binding.MatchesModifiers()) {
                if (!isKeyDown) {
                    isKeyDown = true;
                    if (!IsAuthenticated) {
                        return;
                    }
                    TriggerAction(action);
                }
            } else {
                if (!baseDown) {
                    isKeyDown = false;
                }
            }
        }

        private static long GetCurrentTimestampMs() {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        }

        private static string GetLocalStateFilePath() {
            if (!string.IsNullOrEmpty(localStateFilePath)) return localStateFilePath;
            try {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string dir = Path.Combine(localAppData, "SoulsDeathCounter");
                if (!Directory.Exists(dir)) {
                    Directory.CreateDirectory(dir);
                }
                localStateFilePath = Path.Combine(dir, "death-state.json");
            } catch {
                localStateFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "death-state.json");
            }
            return localStateFilePath;
        }

        private static void LoadLocalState() {
            try {
                if (!IsAuthenticated) {
                    lock (stateLock) {
                        localDeaths = 0;
                        localSessionDeaths = 0;
                        localAllTimeDeaths = 0;
                        localBossKills = 0;
                        localLastUpdated = 0;
                    }
                    return;
                }

                string path = GetLocalStateFilePath();
                string fallbackPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "death-state.json");
                string usePath = File.Exists(path) ? path : (File.Exists(fallbackPath) ? fallbackPath : null);

                if (usePath != null) {
                    string json = File.ReadAllText(usePath);
                    Match mDeaths = Regex.Match(json, @"""deaths""\s*:\s*(\d+)");
                    Match mSession = Regex.Match(json, @"""sessionDeaths""\s*:\s*(\d+)");
                    Match mAllTime = Regex.Match(json, @"""allTimeDeaths""\s*:\s*(\d+)");
                    Match mBoss = Regex.Match(json, @"""bossKills""\s*:\s*(\d+)");
                    Match mTime = Regex.Match(json, @"""lastUpdated""\s*:\s*(\d+)");

                    if (mDeaths.Success) int.TryParse(mDeaths.Groups[1].Value, out localDeaths);
                    if (mSession.Success) int.TryParse(mSession.Groups[1].Value, out localSessionDeaths);
                    if (mAllTime.Success) int.TryParse(mAllTime.Groups[1].Value, out localAllTimeDeaths);
                    if (mBoss.Success) int.TryParse(mBoss.Groups[1].Value, out localBossKills);
                    if (mTime.Success) long.TryParse(mTime.Groups[1].Value, out localLastUpdated);
                }
            } catch {}
        }

        private static void SaveLocalState() {
            try {
                if (!IsAuthenticated) return;
                string path = GetLocalStateFilePath();
                string json = string.Format(
                    "{{\n  \"deaths\": {0},\n  \"sessionDeaths\": {1},\n  \"allTimeDeaths\": {2},\n  \"bossKills\": {3},\n  \"lastUpdated\": {4}\n}}",
                    localDeaths, localSessionDeaths, localAllTimeDeaths, localBossKills, localLastUpdated
                );
                File.WriteAllText(path, json);
            } catch {}
        }

        private void UpdateStatusDisplay(int deaths, int bossKills) {
            if (lblServerPing != null && !lblServerPing.IsDisposed) {
                if (IsAuthenticated) {
                    lblServerPing.Text = string.Format("Live OBS & Cloud Synced! Death: {0} | Boss: {1}", deaths, bossKills);
                    lblServerPing.ForeColor = Color.FromArgb(74, 222, 128);
                } else {
                    lblServerPing.Text = "Sign in required to activate counter";
                    lblServerPing.ForeColor = Color.FromArgb(248, 113, 113);
                }
            }
            UpdateCountersUI();
        }

        private void UpdateCountersUI() {
            SafeInvoke(delegate {
                if (lblDeathNumber != null && !lblDeathNumber.IsDisposed) {
                    lblDeathNumber.Text = localDeaths.ToString();
                }
                if (lblDeathSub != null && !lblDeathSub.IsDisposed) {
                    lblDeathSub.Text = string.Format("Session: {0} • Total: {1}", localSessionDeaths, localAllTimeDeaths);
                }
                if (lblBossNumber != null && !lblBossNumber.IsDisposed) {
                    lblBossNumber.Text = localBossKills.ToString();
                }
                if (lblBossSub != null && !lblBossSub.IsDisposed) {
                    lblBossSub.Text = localBossKills == 1 ? "1 Boss Defeated" : string.Format("{0} Bosses Defeated", localBossKills);
                }
            });
        }

        private void PromptSetCount(string target) {
            if (!IsAuthenticated) {
                LogActivity("⚠ Sign in required: Sign in with your Streamer Account to set counts.");
                BtnGoogleSignIn_Click(this, EventArgs.Empty);
                return;
            }
            bool isDeath = target == "death";
            string title = isDeath ? "Set Death Count" : "Set Boss Slain Count";
            int currentVal = isDeath ? localDeaths : localBossKills;

            using (Form prompt = new Form()) {
                prompt.Text = title;
                prompt.Size = new Size(320, 180);
                prompt.FormBorderStyle = FormBorderStyle.FixedDialog;
                prompt.StartPosition = FormStartPosition.CenterParent;
                prompt.MaximizeBox = false;
                prompt.MinimizeBox = false;
                prompt.BackColor = Color.FromArgb(20, 21, 17);
                prompt.ForeColor = Color.FromArgb(226, 217, 197);
                prompt.Font = new Font("Segoe UI", 9F);

                Label lblPrompt = new Label();
                lblPrompt.Text = string.Format("Enter new {0} count:", isDeath ? "death" : "boss slain");
                lblPrompt.Location = new Point(20, 20);
                lblPrompt.AutoSize = true;
                prompt.Controls.Add(lblPrompt);

                TextBox txtVal = new TextBox();
                txtVal.Text = currentVal.ToString();
                txtVal.Location = new Point(22, 48);
                txtVal.Size = new Size(260, 24);
                txtVal.BackColor = Color.FromArgb(12, 13, 10);
                txtVal.ForeColor = Color.FromArgb(200, 166, 93);
                txtVal.BorderStyle = BorderStyle.FixedSingle;
                txtVal.SelectAll();
                prompt.Controls.Add(txtVal);

                Button btnOk = new Button();
                btnOk.Text = "Set Count";
                btnOk.Location = new Point(116, 90);
                btnOk.Size = new Size(86, 28);
                btnOk.FlatStyle = FlatStyle.Flat;
                btnOk.FlatAppearance.BorderSize = 1;
                btnOk.FlatAppearance.BorderColor = Color.FromArgb(74, 63, 38);
                btnOk.BackColor = Color.FromArgb(42, 34, 16);
                btnOk.ForeColor = Color.FromArgb(250, 204, 21);
                btnOk.DialogResult = DialogResult.OK;
                prompt.AcceptButton = btnOk;
                prompt.Controls.Add(btnOk);

                Button btnCancel = new Button();
                btnCancel.Text = "Cancel";
                btnCancel.Location = new Point(210, 90);
                btnCancel.Size = new Size(72, 28);
                btnCancel.FlatStyle = FlatStyle.Flat;
                btnCancel.FlatAppearance.BorderSize = 1;
                btnCancel.FlatAppearance.BorderColor = Color.FromArgb(60, 55, 45);
                btnCancel.BackColor = Color.FromArgb(28, 29, 23);
                btnCancel.ForeColor = Color.FromArgb(160, 155, 140);
                btnCancel.DialogResult = DialogResult.Cancel;
                prompt.CancelButton = btnCancel;
                prompt.Controls.Add(btnCancel);

                if (prompt.ShowDialog(this) == DialogResult.OK) {
                    int val;
                    if (int.TryParse(txtVal.Text.Trim(), out val) && val >= 0) {
                        lock (stateLock) {
                            if (isDeath) {
                                int diff = val - localDeaths;
                                localDeaths = val;
                                localSessionDeaths = Math.Max(0, localSessionDeaths + diff);
                                localAllTimeDeaths = Math.Max(0, localAllTimeDeaths + Math.Max(0, diff));
                            } else {
                                localBossKills = val;
                            }
                            localLastUpdated = GetCurrentTimestampMs();
                            SaveLocalState();
                        }
                        UpdateStatusDisplay(localDeaths, localBossKills);
                        UpdateCountersUI();

                        // Sync to cloud server
                        ThreadPool.QueueUserWorkItem(delegate {
                            try {
                                using (WebClient client = new WebClient()) {
                                    client.Headers["User-Agent"] = "SoulsDeathCounter/2.0";
                                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                                    string endpoint = GetCloudEndpoint("/api/state");
                                    string payload = string.Format(
                                        "{{\"type\":\"stateUpdate\",\"deaths\":{0},\"sessionDeaths\":{1},\"allTimeDeaths\":{2},\"bossKills\":{3},\"lastUpdated\":{4},\"key\":\"{5}\"}}",
                                        localDeaths, localSessionDeaths, localAllTimeDeaths, localBossKills, localLastUpdated, streamerKey ?? ""
                                    );
                                    client.UploadString(endpoint, "POST", payload);
                                }
                            } catch {}
                        });

                        LogActivity(string.Format("Manually set {0} to {1} (Saved on PC & live OBS)", isDeath ? "Deaths" : "Boss Slain", val));
                    }
                }
            }
        }

        private void BtnManualResetDeath_Click(object sender, EventArgs e) {
            if (!IsAuthenticated) {
                LogActivity("⚠ Sign in required: Sign in with your Streamer Account to reset deaths.");
                return;
            }
            if (confirmResetDeath) {
                confirmResetDeath = false;
                btnManualResetDeath.Text = "Reset";
                btnManualResetDeath.BackColor = Color.FromArgb(26, 16, 16);
                btnManualResetDeath.ForeColor = Color.FromArgb(220, 100, 100);

                lock (stateLock) {
                    localDeaths = 0;
                    localSessionDeaths = 0;
                    localLastUpdated = GetCurrentTimestampMs();
                    SaveLocalState();
                }
                UpdateStatusDisplay(localDeaths, localBossKills);
                UpdateCountersUI();

                ThreadPool.QueueUserWorkItem(delegate {
                    try {
                        using (WebClient client = new WebClient()) {
                            client.Headers["User-Agent"] = "SoulsDeathCounter/2.0";
                            client.Headers[HttpRequestHeader.ContentType] = "application/json";
                            string endpoint = GetCloudEndpoint("/api/state");
                            string payload = string.Format(
                                "{{\"type\":\"stateUpdate\",\"deaths\":0,\"sessionDeaths\":0,\"allTimeDeaths\":{0},\"bossKills\":{1},\"lastUpdated\":{2},\"key\":\"{3}\"}}",
                                localAllTimeDeaths, localBossKills, localLastUpdated, streamerKey ?? ""
                            );
                            client.UploadString(endpoint, "POST", payload);
                        }
                    } catch {}
                });

                LogActivity("Deaths reset to 0 (Saved on PC & live OBS)");
            } else {
                confirmResetDeath = true;
                btnManualResetDeath.Text = "Sure?";
                btnManualResetDeath.BackColor = Color.FromArgb(70, 20, 20);
                btnManualResetDeath.ForeColor = Color.FromArgb(255, 200, 200);

                if (resetDeathTimer == null) {
                    resetDeathTimer = new System.Windows.Forms.Timer();
                    resetDeathTimer.Interval = 3000;
                    resetDeathTimer.Tick += delegate {
                        confirmResetDeath = false;
                        resetDeathTimer.Stop();
                        if (btnManualResetDeath != null && !btnManualResetDeath.IsDisposed) {
                            btnManualResetDeath.Text = "Reset";
                            btnManualResetDeath.BackColor = Color.FromArgb(26, 16, 16);
                            btnManualResetDeath.ForeColor = Color.FromArgb(220, 100, 100);
                        }
                    };
                }
                resetDeathTimer.Stop();
                resetDeathTimer.Start();
            }
        }

        private void BtnManualResetBoss_Click(object sender, EventArgs e) {
            if (!IsAuthenticated) {
                LogActivity("⚠ Sign in required: Sign in with your Streamer Account to reset boss kills.");
                return;
            }
            if (confirmResetBoss) {
                confirmResetBoss = false;
                btnManualResetBoss.Text = "Reset";
                btnManualResetBoss.BackColor = Color.FromArgb(26, 16, 16);
                btnManualResetBoss.ForeColor = Color.FromArgb(220, 100, 100);

                lock (stateLock) {
                    localBossKills = 0;
                    localLastUpdated = GetCurrentTimestampMs();
                    SaveLocalState();
                }
                UpdateStatusDisplay(localDeaths, localBossKills);
                UpdateCountersUI();

                ThreadPool.QueueUserWorkItem(delegate {
                    try {
                        using (WebClient client = new WebClient()) {
                            client.Headers["User-Agent"] = "SoulsDeathCounter/2.0";
                            client.Headers[HttpRequestHeader.ContentType] = "application/json";
                            string endpoint = GetCloudEndpoint("/api/state");
                            string payload = string.Format(
                                "{{\"type\":\"stateUpdate\",\"deaths\":{0},\"sessionDeaths\":{1},\"allTimeDeaths\":{2},\"bossKills\":0,\"lastUpdated\":{3},\"key\":\"{4}\"}}",
                                localDeaths, localSessionDeaths, localAllTimeDeaths, localLastUpdated, streamerKey ?? ""
                            );
                            client.UploadString(endpoint, "POST", payload);
                        }
                    } catch {}
                });

                LogActivity("Boss Slain count reset to 0 (Saved on PC & live OBS)");
            } else {
                confirmResetBoss = true;
                btnManualResetBoss.Text = "Sure?";
                btnManualResetBoss.BackColor = Color.FromArgb(70, 20, 20);
                btnManualResetBoss.ForeColor = Color.FromArgb(255, 200, 200);

                if (resetBossTimer == null) {
                    resetBossTimer = new System.Windows.Forms.Timer();
                    resetBossTimer.Interval = 3000;
                    resetBossTimer.Tick += delegate {
                        confirmResetBoss = false;
                        resetBossTimer.Stop();
                        if (btnManualResetBoss != null && !btnManualResetBoss.IsDisposed) {
                            btnManualResetBoss.Text = "Reset";
                            btnManualResetBoss.BackColor = Color.FromArgb(26, 16, 16);
                            btnManualResetBoss.ForeColor = Color.FromArgb(220, 100, 100);
                        }
                    };
                }
                resetBossTimer.Stop();
                resetBossTimer.Start();
            }
        }

        // ─── Direct OBS Local Server (http://127.0.0.1:4455) ───
        private static void StartLocalHttpServer() {
            try {
                if (localHttpListener != null && isLocalServerRunning) return;
                localHttpListener = new HttpListener();
                localHttpListener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", LOCAL_SERVER_PORT));
                localHttpListener.Start();
                isLocalServerRunning = true;

                localHttpThread = new Thread(new ThreadStart(LocalHttpServerLoop));
                localHttpThread.IsBackground = true;
                localHttpThread.Start();

                if (instance != null) {
                    instance.LogActivity(string.Format("Direct OBS Server active on http://127.0.0.1:{0} (0ms latency)", LOCAL_SERVER_PORT));
                }
            } catch (Exception ex) {
                if (instance != null) {
                    instance.LogActivity("Notice: Local server could not bind port 4455: " + ex.Message);
                }
            }
        }

        private static void StopLocalHttpServer() {
            try {
                isLocalServerRunning = false;
                if (localHttpListener != null) {
                    localHttpListener.Stop();
                    localHttpListener.Close();
                    localHttpListener = null;
                }
                if (localHttpThread != null && localHttpThread.IsAlive) {
                    localHttpThread.Abort();
                    localHttpThread = null;
                }
            } catch {}
        }

        private static void LocalHttpServerLoop() {
            while (isLocalServerRunning && localHttpListener != null && localHttpListener.IsListening) {
                try {
                    HttpListenerContext context = localHttpListener.GetContext();
                    ThreadPool.QueueUserWorkItem(delegate {
                        HandleLocalHttpRequest(context);
                    });
                } catch {
                    if (!isLocalServerRunning) break;
                }
            }
        }

        private static void HandleLocalHttpRequest(HttpListenerContext context) {
            try {
                HttpListenerRequest req = context.Request;
                HttpListenerResponse res = context.Response;

                // Full CORS support so OBS Studio Browser Source & Web Browser connect with zero blocks
                res.Headers["Access-Control-Allow-Origin"] = "*";
                res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                res.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With";
                res.Headers["Access-Control-Allow-Private-Network"] = "true";
                res.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                res.Headers["Pragma"] = "no-cache";

                if (req.HttpMethod == "OPTIONS") {
                    res.StatusCode = 204;
                    res.Close();
                    return;
                }

                string path = req.Url.AbsolutePath.ToLowerInvariant();

                // ─── Account Linking Endpoint (/api/auth) ───
                if (path == "/api/auth" || path == "/auth") {
                    string key = "";
                    string name = "";
                    string email = "";

                    if (req.HttpMethod == "POST") {
                        string body = "";
                        using (StreamReader reader = new StreamReader(req.InputStream, req.ContentEncoding)) {
                            body = reader.ReadToEnd();
                        }
                        Match mKey = Regex.Match(body, @"""streamerKey""\s*:\s*""([^""]+)""");
                        Match mName = Regex.Match(body, @"""displayName""\s*:\s*""([^""]+)""");
                        Match mEmail = Regex.Match(body, @"""email""\s*:\s*""([^""]+)""");

                        if (mKey.Success) key = mKey.Groups[1].Value;
                        if (mName.Success) name = mName.Groups[1].Value;
                        if (mEmail.Success) email = mEmail.Groups[1].Value;
                    } else if (req.HttpMethod == "GET") {
                        key = req.QueryString["key"] ?? req.QueryString["streamerKey"] ?? "";
                        name = req.QueryString["name"] ?? req.QueryString["displayName"] ?? "";
                        email = req.QueryString["email"] ?? "";
                    }

                    if (!string.IsNullOrEmpty(key) && key != "guest") {
                        streamerKey = key;
                        userDisplayName = !string.IsNullOrEmpty(name) ? name : (!string.IsNullOrEmpty(email) ? email : key);
                        userEmail = email ?? "";
                        isUserSignedIn = true;
                        if (instance != null) {
                            instance.SaveConfig();
                            instance.SafeInvoke(delegate {
                                instance.UpdateAccountUI();
                                instance.LogActivity(string.Format("✦ Google Account Linked: {0} ({1}) [Key: {2}]", userDisplayName, userEmail, streamerKey));
                                instance.TestConnectionAsync();
                            });
                        }

                        string json = string.Format(
                            "{{\"success\":true,\"authenticated\":true,\"streamerKey\":\"{0}\",\"displayName\":\"{1}\",\"message\":\"Linked to Desktop App successfully\"}}",
                            streamerKey, userDisplayName
                        );
                        byte[] buffer = System.Text.Encoding.UTF8.GetBytes(json);
                        res.ContentType = "application/json";
                        res.ContentLength64 = buffer.Length;
                        res.StatusCode = 200;
                        res.OutputStream.Write(buffer, 0, buffer.Length);
                        res.OutputStream.Close();
                        return;
                    }
                }

                if (req.HttpMethod == "GET" && (path == "/api/state" || path == "/" || path == "/state")) {
                    string json;
                    if (!IsAuthenticated) {
                        json = "{\"authenticated\":false,\"error\":\"Sign in required\",\"deaths\":0,\"sessionDeaths\":0,\"allTimeDeaths\":0,\"bossKills\":0,\"lastUpdated\":0,\"isLocal\":true}";
                    } else {
                        lock (stateLock) {
                            json = string.Format(
                                "{{\"authenticated\":true,\"deaths\":{0},\"sessionDeaths\":{1},\"allTimeDeaths\":{2},\"bossKills\":{3},\"lastUpdated\":{4},\"isLocal\":true,\"streamerKey\":\"{5}\",\"userDisplayName\":\"{6}\"}}",
                                localDeaths, localSessionDeaths, localAllTimeDeaths, localBossKills, localLastUpdated, streamerKey ?? "", userDisplayName ?? ""
                            );
                        }
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
                    Match mBoss = Regex.Match(body, @"""bossKills""\s*:\s*(\d+)");
                    Match mSession = Regex.Match(body, @"""sessionDeaths""\s*:\s*(\d+)");
                    Match mAllTime = Regex.Match(body, @"""allTimeDeaths""\s*:\s*(\d+)");
                    Match mStreamer = Regex.Match(body, @"""(?:streamerKey|key)""\s*:\s*""([^""]+)""");

                    if (mStreamer.Success && !string.IsNullOrEmpty(mStreamer.Groups[1].Value)) {
                        string incomingKey = mStreamer.Groups[1].Value;
                        if (incomingKey != "guest" && incomingKey != streamerKey) {
                            streamerKey = incomingKey;
                            isUserSignedIn = true;
                            if (instance != null) {
                                instance.SaveConfig();
                                instance.SafeInvoke(delegate { instance.UpdateAccountUI(); });
                            }
                        }
                    }

                    if (!IsAuthenticated) {
                        string errJson = "{\"success\":false,\"authenticated\":false,\"error\":\"Authentication required. Sign in is mandatory.\"}";
                        byte[] errBuf = System.Text.Encoding.UTF8.GetBytes(errJson);
                        res.ContentType = "application/json";
                        res.ContentLength64 = errBuf.Length;
                        res.StatusCode = 401;
                        res.OutputStream.Write(errBuf, 0, errBuf.Length);
                        res.OutputStream.Close();
                        return;
                    }

                    string action = mAct.Success ? mAct.Groups[1].Value : "";

                    int curD, curS, curA, curB;
                    long curT;

                    lock (stateLock) {
                        if (action == "add" || action == "addDeath") {
                            localDeaths++;
                            localSessionDeaths++;
                            localAllTimeDeaths++;
                        } else if (action == "undo" || action == "undoDeath") {
                            if (localDeaths > 0) localDeaths--;
                            if (localSessionDeaths > 0) localSessionDeaths--;
                        } else if (action == "addBossKill" || action == "bossSlain") {
                            localBossKills++;
                        } else if (action == "undoBossKill") {
                            if (localBossKills > 0) localBossKills--;
                        } else if (action == "reset" || action == "resetSession") {
                            localSessionDeaths = 0;
                        } else if (action == "resetAll") {
                            localDeaths = 0;
                            localSessionDeaths = 0;
                            localBossKills = 0;
                        }

                        if (mDeaths.Success) int.TryParse(mDeaths.Groups[1].Value, out localDeaths);
                        if (mSession.Success) int.TryParse(mSession.Groups[1].Value, out localSessionDeaths);
                        if (mAllTime.Success) int.TryParse(mAllTime.Groups[1].Value, out localAllTimeDeaths);
                        if (mBoss.Success) int.TryParse(mBoss.Groups[1].Value, out localBossKills);

                        localLastUpdated = GetCurrentTimestampMs();
                        SaveLocalState();

                        curD = localDeaths;
                        curS = localSessionDeaths;
                        curA = localAllTimeDeaths;
                        curB = localBossKills;
                        curT = localLastUpdated;
                    }

                    if (instance != null) {
                        instance.SafeInvoke(delegate {
                            instance.UpdateStatusDisplay(curD, curB);
                            instance.LogActivity(string.Format("OBS/Web trigger [{0}] -> Deaths: {1}, Bosses: {2}", action, curD, curB));
                        });
                    }

                    string json = string.Format(
                        "{{\"success\":true,\"deaths\":{0},\"sessionDeaths\":{1},\"allTimeDeaths\":{2},\"bossKills\":{3},\"lastUpdated\":{4},\"isLocal\":true}}",
                        curD, curS, curA, curB, curT
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

        private static void StartBackgroundStateSync() {
            Thread syncThread = new Thread(new ThreadStart(BackgroundStateSyncLoop));
            syncThread.IsBackground = true;
            syncThread.Start();
        }

        private static void BackgroundStateSyncLoop() {
            Thread.Sleep(2000);
            while (true) {
                try {
                    SyncWithServerOnce();
                } catch {}
                Thread.Sleep(3500);
            }
        }

        private static void SyncWithServerOnce() {
            // Only sync with remote cloud if signed in to an account or a specific channel/key is set
            string cloudKey = !string.IsNullOrEmpty(streamerKey) && streamerKey != "guest" ? streamerKey : "";
            if (string.IsNullOrEmpty(serverUrl) || (string.IsNullOrEmpty(cloudKey) && !serverUrl.Contains("channel=") && !serverUrl.Contains("key="))) return;

            try {
                using (WebClient client = new WebClient()) {
                    client.Headers["User-Agent"] = "SoulsDeathCounter/2.0";
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    string endpoint = GetCloudEndpoint("/api/state");
                    string sep = endpoint.Contains("?") ? "&" : "?";
                    endpoint += sep + "_t=" + DateTime.UtcNow.Ticks;
                    string json = client.DownloadString(endpoint);

                    Match mDeaths = Regex.Match(json, @"""deaths""\s*:\s*(\d+)");
                    Match mSession = Regex.Match(json, @"""sessionDeaths""\s*:\s*(\d+)");
                    Match mAllTime = Regex.Match(json, @"""allTimeDeaths""\s*:\s*(\d+)");
                    Match mBoss = Regex.Match(json, @"""bossKills""\s*:\s*(\d+)");
                    Match mTime = Regex.Match(json, @"""lastUpdated""\s*:\s*(\d+)");

                    int srvDeaths = mDeaths.Success ? int.Parse(mDeaths.Groups[1].Value) : 0;
                    int srvSession = mSession.Success ? int.Parse(mSession.Groups[1].Value) : 0;
                    int srvAllTime = mAllTime.Success ? int.Parse(mAllTime.Groups[1].Value) : 0;
                    int srvBoss = mBoss.Success ? int.Parse(mBoss.Groups[1].Value) : 0;
                    long srvTime = mTime.Success ? long.Parse(mTime.Groups[1].Value) : 0;

                    lock (stateLock) {
                        if (localLastUpdated > srvTime) {
                            string syncEndpoint = GetCloudEndpoint("/api/state");
                            string payload = string.Format(
                                "{{\"type\":\"stateUpdate\",\"deaths\":{0},\"sessionDeaths\":{1},\"allTimeDeaths\":{2},\"bossKills\":{3},\"lastUpdated\":{4},\"key\":\"{5}\"}}",
                                localDeaths, localSessionDeaths, localAllTimeDeaths, localBossKills, localLastUpdated > 0 ? localLastUpdated : GetCurrentTimestampMs(), streamerKey ?? ""
                            );
                            client.UploadString(syncEndpoint, "POST", payload);
                            return;
                        }

                        if (srvTime > localLastUpdated) {
                            localDeaths = srvDeaths;
                            localSessionDeaths = srvSession;
                            localAllTimeDeaths = srvAllTime;
                            localBossKills = srvBoss;
                            localLastUpdated = srvTime;
                            SaveLocalState();

                            if (instance != null) {
                                instance.SafeInvoke(delegate {
                                    instance.UpdateStatusDisplay(localDeaths, localBossKills);
                                });
                            }
                        }
                    }
                }
            } catch {}
        }

        private static void TriggerAction(string action) {
            if (!IsAuthenticated) {
                if (instance != null) {
                    instance.SafeInvoke(delegate {
                        instance.LogActivity("⚠ Action blocked: Sign-in is mandatory to use the Death Counter.");
                    });
                }
                return;
            }

            long now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
            lock (actionLock) {
                if (now - lastActionTime < 350) return;
                lastActionTime = now;
            }

            int curD, curS, curA, curB;
            long curT;

            lock (stateLock) {
                if (action == "add") {
                    localDeaths++;
                    localSessionDeaths++;
                    localAllTimeDeaths++;
                } else if (action == "undo") {
                    if (localDeaths > 0) localDeaths--;
                    if (localSessionDeaths > 0) localSessionDeaths--;
                } else if (action == "addBossKill") {
                    localBossKills++;
                } else if (action == "undoBossKill") {
                    if (localBossKills > 0) localBossKills--;
                }
                localLastUpdated = GetCurrentTimestampMs();
                SaveLocalState();

                curD = localDeaths;
                curS = localSessionDeaths;
                curA = localAllTimeDeaths;
                curB = localBossKills;
                curT = localLastUpdated;
            }

            if (instance != null) {
                string keyDesc = "";
                string actionDesc = "";
                if (action == "add") { keyDesc = bindingAdd.DisplayName; actionDesc = "+1 Death"; }
                else if (action == "undo") { keyDesc = bindingUndo.DisplayName; actionDesc = "Undo Death"; }
                else if (action == "addBossKill") { keyDesc = bindingAddBoss.DisplayName; actionDesc = "+1 Boss Slain"; }
                else if (action == "undoBossKill") { keyDesc = bindingUndoBoss.DisplayName; actionDesc = "Undo Boss Slain"; }

                instance.SafeInvoke(delegate {
                    instance.UpdateStatusDisplay(curD, curB);
                    instance.LogActivity(string.Format("{0} [{1}] -> Saved to PC & Direct OBS! (Death: {2}, Boss: {3})", keyDesc, actionDesc, curD, curB));
                });
            }

            // Sync with remote cloud if signed in with Google or a channel/key is set
            string cloudKey = !string.IsNullOrEmpty(streamerKey) && streamerKey != "guest" ? streamerKey : "";
            if (!string.IsNullOrEmpty(serverUrl) && (!string.IsNullOrEmpty(cloudKey) || serverUrl.Contains("channel=") || serverUrl.Contains("key="))) {
                ThreadPool.QueueUserWorkItem(delegate {
                    try {
                        using (WebClient client = new WebClient()) {
                            client.Headers["User-Agent"] = "SoulsDeathCounter/2.0";
                            client.Headers[HttpRequestHeader.ContentType] = "application/json";
                            string endpoint = GetCloudEndpoint("/api/action");
                            string payload = string.Format(
                                "{{\"action\":\"{0}\",\"deaths\":{1},\"sessionDeaths\":{2},\"allTimeDeaths\":{3},\"bossKills\":{4},\"lastUpdated\":{5},\"key\":\"{6}\"}}",
                                action, curD, curS, curA, curB, curT, cloudKey
                            );
                            client.UploadString(endpoint, "POST", payload);
                        }
                    } catch {}
                });
            }
        }

        // ─── Config Loading & Saving ───
        private void LoadConfig() {
            try {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                configFilePath = Path.Combine(baseDir, "hotkey-config.json");
                dataFilePath = Path.Combine(baseDir, "..", "death-counter-data.json");
                if (!File.Exists(dataFilePath)) {
                    dataFilePath = Path.Combine(baseDir, "death-counter-data.json");
                }

                if (File.Exists(configFilePath)) {
                    string json = File.ReadAllText(configFilePath);
                    ParseJsonConfig(json);
                } else if (File.Exists(dataFilePath)) {
                    string json = File.ReadAllText(dataFilePath);
                    ParseJsonConfig(json);
                }
            } catch {}
        }

        private void ParseJsonConfig(string json) {
            Match mUrl = Regex.Match(json, @"""serverUrl""\s*:\s*""([^""]+)""");
            if (mUrl.Success && !string.IsNullOrEmpty(mUrl.Groups[1].Value)) {
                serverUrl = mUrl.Groups[1].Value.TrimEnd('/');
                if (txtServerUrl != null) txtServerUrl.Text = serverUrl;
            }

            Match mKey = Regex.Match(json, @"""streamerKey""\s*:\s*""([^""]+)""");
            if (mKey.Success) {
                streamerKey = mKey.Groups[1].Value;
            }
            Match mName = Regex.Match(json, @"""userDisplayName""\s*:\s*""([^""]+)""");
            if (mName.Success) {
                userDisplayName = mName.Groups[1].Value;
            }
            Match mEmail = Regex.Match(json, @"""userEmail""\s*:\s*""([^""]+)""");
            if (mEmail.Success) {
                userEmail = mEmail.Groups[1].Value;
            }
            isUserSignedIn = !string.IsNullOrEmpty(streamerKey) && streamerKey != "guest";

            Match mAdd = Regex.Match(json, @"""addDeath""\s*:\s*""([^""]+)""");
            if (mAdd.Success) {
                string val = mAdd.Groups[1].Value;
                bindingAdd = HotkeyBinding.FromString(val, DEFAULT_ADD_KEY, "F8");
                EnsureKeyInCombo(cmbAddKey, bindingAdd.DisplayName);
                if (cmbAddKey != null) cmbAddKey.SelectedItem = bindingAdd.DisplayName;
            }

            Match mUndo = Regex.Match(json, @"""undoDeath""\s*:\s*""([^""]+)""");
            if (mUndo.Success) {
                string val = mUndo.Groups[1].Value;
                bindingUndo = HotkeyBinding.FromString(val, DEFAULT_UNDO_KEY, "F7");
                EnsureKeyInCombo(cmbUndoKey, bindingUndo.DisplayName);
                if (cmbUndoKey != null) cmbUndoKey.SelectedItem = bindingUndo.DisplayName;
            }

            Match mAddBoss = Regex.Match(json, @"""addBossKill""\s*:\s*""([^""]+)""");
            if (mAddBoss.Success) {
                string val = mAddBoss.Groups[1].Value;
                bindingAddBoss = HotkeyBinding.FromString(val, DEFAULT_ADD_BOSS_KEY, "F9");
                EnsureKeyInCombo(cmbAddBossKey, bindingAddBoss.DisplayName);
                if (cmbAddBossKey != null) cmbAddBossKey.SelectedItem = bindingAddBoss.DisplayName;
            }

            Match mUndoBoss = Regex.Match(json, @"""undoBossKill""\s*:\s*""([^""]+)""");
            if (mUndoBoss.Success) {
                string val = mUndoBoss.Groups[1].Value;
                bindingUndoBoss = HotkeyBinding.FromString(val, DEFAULT_UNDO_BOSS_KEY, "F10");
                EnsureKeyInCombo(cmbUndoBossKey, bindingUndoBoss.DisplayName);
                if (cmbUndoBossKey != null) cmbUndoBossKey.SelectedItem = bindingUndoBoss.DisplayName;
            }

            Match mEn = Regex.Match(json, @"""enabled""\s*:\s*(true|false)");
            if (mEn.Success) {
                isHotkeysActive = mEn.Groups[1].Value == "true";
            }
        }

        private void SaveConfig() {
            if (isInitializing) return;
            try {
                if (string.IsNullOrEmpty(configFilePath)) {
                    configFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "hotkey-config.json");
                }
                string json = string.Format(
                    "{{\n  \"serverUrl\": \"{0}\",\n  \"addDeath\": \"{1}\",\n  \"undoDeath\": \"{2}\",\n  \"addBossKill\": \"{3}\",\n  \"undoBossKill\": \"{4}\",\n  \"enabled\": {5},\n  \"streamerKey\": \"{6}\",\n  \"userDisplayName\": \"{7}\",\n  \"userEmail\": \"{8}\"\n}}",
                    serverUrl,
                    bindingAdd != null ? bindingAdd.DisplayName : "F8",
                    bindingUndo != null ? bindingUndo.DisplayName : "F7",
                    bindingAddBoss != null ? bindingAddBoss.DisplayName : "F9",
                    bindingUndoBoss != null ? bindingUndoBoss.DisplayName : "F10",
                    isHotkeysActive ? "true" : "false",
                    streamerKey ?? "",
                    userDisplayName ?? "",
                    userEmail ?? ""
                );
                File.WriteAllText(configFilePath, json);
            } catch {}
        }

        [STAThread]
        public static void Main(string[] args) {
            try {
                AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e) {
                    try {
                        File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "unhandled_thread_error.log"), e.ExceptionObject.ToString());
                    } catch {}
                };
            } catch {}

            try {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)12288 | (SecurityProtocolType)3072 | (SecurityProtocolType)768 | SecurityProtocolType.Tls;
            } catch {}

            try {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new HotkeyAppForm());
            } catch (Exception ex) {
                try {
                    File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "startup_error.log"), ex.ToString());
                } catch {}
                MessageBox.Show("Fatal Error: " + ex.ToString(), "Death Counter Hotkeys", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
