using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

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
        private static IntPtr hookId = IntPtr.Zero;
        private static LowLevelKeyboardProc hookProc;
        private static long lastActionTime = 0;
        private static readonly object actionLock = new object();

        // UI Controls
        private Button btnToggle;
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
                isInitializing = false;
                InstallHook();
                StartAsyncPolling();
                UpdateUIState();

                this.Shown += delegate {
                    TestConnectionAsync();
                    LogActivity(string.Format("App ready. Death: [{0} / {1}] | Boss: [{2} / {3}]",
                        bindingAdd.DisplayName, bindingUndo.DisplayName, bindingAddBoss.DisplayName, bindingUndoBoss.DisplayName));
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
            this.Size = new Size(530, 715);
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
            btnToggle.Location = new Point(20, 76);
            btnToggle.Size = new Size(475, 46);
            btnToggle.FlatStyle = FlatStyle.Flat;
            btnToggle.FlatAppearance.BorderSize = 1;
            btnToggle.Font = new Font("Segoe UI", 10.5F, FontStyle.Bold);
            btnToggle.Cursor = Cursors.Hand;
            btnToggle.Click += BtnToggle_Click;
            this.Controls.Add(btnToggle);

            // ─── Hotkeys Configuration Card ───
            GroupBox grpHotkeys = new GroupBox();
            grpHotkeys.Text = " Configured Hotkeys (Customizable • Works In-Game) ";
            grpHotkeys.Location = new Point(20, 132);
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

            // ─── Server URL Connection Card ───
            GroupBox grpServer = new GroupBox();
            grpServer.Text = " Overlay Server Connection ";
            grpServer.Location = new Point(20, 334);
            grpServer.Size = new Size(475, 88);
            grpServer.ForeColor = Color.FromArgb(200, 166, 93);
            grpServer.BackColor = Color.FromArgb(24, 25, 20);

            Label lblServer = new Label();
            lblServer.Text = "Server URL:";
            lblServer.Location = new Point(16, 24);
            lblServer.AutoSize = true;
            lblServer.ForeColor = Color.FromArgb(226, 217, 197);
            grpServer.Controls.Add(lblServer);

            txtServerUrl = new TextBox();
            txtServerUrl.Location = new Point(95, 21);
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
            btnTestConnection.Location = new Point(378, 20);
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
            lblServerPing.Location = new Point(95, 52);
            lblServerPing.Size = new Size(365, 20);
            lblServerPing.Font = new Font("Segoe UI", 8F);
            lblServerPing.ForeColor = Color.FromArgb(145, 140, 125);
            grpServer.Controls.Add(lblServerPing);

            this.Controls.Add(grpServer);

            // ─── Live Activity Log ───
            Label lblLog = new Label();
            lblLog.Text = "Live Activity & Keystroke Monitor:";
            lblLog.Location = new Point(20, 430);
            lblLog.AutoSize = true;
            lblLog.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            lblLog.ForeColor = Color.FromArgb(160, 155, 140);
            this.Controls.Add(lblLog);

            txtActivityLog = new TextBox();
            txtActivityLog.Location = new Point(20, 452);
            txtActivityLog.Size = new Size(475, 155);
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
            chkMinimizeToTray.Text = "Minimize to System Tray when closed (keeps running)";
            chkMinimizeToTray.Location = new Point(22, 618);
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

        private void BtnToggle_Click(object sender, EventArgs e) {
            isHotkeysActive = !isHotkeysActive;
            UpdateUIState();
            SaveConfig();
            LogActivity(isHotkeysActive ? "Hotkeys ACTIVATED. Listening for configured hotkeys." : "Hotkeys PAUSED.");
        }

        private void UpdateUIState() {
            if (isHotkeysActive) {
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
        }

        private void TestConnectionAsync() {
            if (lblServerPing != null) {
                lblServerPing.Text = "Pinging " + serverUrl + "...";
                lblServerPing.ForeColor = Color.FromArgb(200, 166, 93);
            }

            ThreadPool.QueueUserWorkItem(delegate {
                try {
                    using (WebClient client = new WebClient()) {
                        client.Headers[HttpRequestHeader.ContentType] = "application/json";
                        string json = client.DownloadString(serverUrl + "/api/state");
                        Match mDeaths = Regex.Match(json, @"""deaths""\s*:\s*(\d+)");
                        Match mBoss = Regex.Match(json, @"""bossKills""\s*:\s*(\d+)");
                        string deathCount = mDeaths.Success ? mDeaths.Groups[1].Value : "0";
                        string bossCount = mBoss.Success ? mBoss.Groups[1].Value : "0";

                        SafeInvoke(delegate {
                            if (lblServerPing != null && !lblServerPing.IsDisposed) {
                                lblServerPing.Text = "Connected! Death: " + deathCount + " | Boss Slain: " + bossCount;
                                lblServerPing.ForeColor = Color.FromArgb(74, 222, 128);
                            }
                        });
                    }
                } catch (Exception ex) {
                    SafeInvoke(delegate {
                        if (lblServerPing != null && !lblServerPing.IsDisposed) {
                            lblServerPing.Text = "Cannot reach server (" + ex.Message + ")";
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

                if (!isHotkeysActive || recordingTarget != null) continue;

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
                    TriggerAction(action);
                }
            } else {
                if (!baseDown) {
                    isKeyDown = false;
                }
            }
        }

        private static void TriggerAction(string action) {
            long now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
            lock (actionLock) {
                if (now - lastActionTime < 350) return;
                lastActionTime = now;
            }

            ThreadPool.QueueUserWorkItem(delegate {
                try {
                    using (WebClient client = new WebClient()) {
                        client.Headers[HttpRequestHeader.ContentType] = "application/json";
                        string endpoint = serverUrl.TrimEnd('/') + "/api/action";
                        string res = client.UploadString(endpoint, "POST", "{\"action\":\"" + action + "\"}");

                        Match mDeaths = Regex.Match(res, @"""deaths""\s*:\s*(\d+)");
                        Match mBoss = Regex.Match(res, @"""bossKills""\s*:\s*(\d+)");
                        string deathCount = mDeaths.Success ? mDeaths.Groups[1].Value : "?";
                        string bossCount = mBoss.Success ? mBoss.Groups[1].Value : "0";

                        if (instance != null) {
                            string keyDesc = "";
                            string actionDesc = "";
                            if (action == "add") {
                                keyDesc = bindingAdd.DisplayName;
                                actionDesc = "+1 Death";
                            } else if (action == "undo") {
                                keyDesc = bindingUndo.DisplayName;
                                actionDesc = "Undo Death";
                            } else if (action == "addBossKill") {
                                keyDesc = bindingAddBoss.DisplayName;
                                actionDesc = "+1 Boss Slain";
                            } else if (action == "undoBossKill") {
                                keyDesc = bindingUndoBoss.DisplayName;
                                actionDesc = "Undo Boss Slain";
                            }

                            instance.LogActivity(string.Format("{0} pressed [{1}] -> sent to OBS! (Death: {2}, Boss Slain: {3})", keyDesc, actionDesc, deathCount, bossCount));
                        }
                    }
                } catch (Exception ex) {
                    if (instance != null) {
                        instance.LogActivity(string.Format("Error sending '{0}': {1}", action, ex.Message));
                    }
                }
            });
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
                    "{{\n  \"serverUrl\": \"{0}\",\n  \"addDeath\": \"{1}\",\n  \"undoDeath\": \"{2}\",\n  \"addBossKill\": \"{3}\",\n  \"undoBossKill\": \"{4}\",\n  \"enabled\": {5}\n}}",
                    serverUrl,
                    bindingAdd != null ? bindingAdd.DisplayName : "F8",
                    bindingUndo != null ? bindingUndo.DisplayName : "F7",
                    bindingAddBoss != null ? bindingAddBoss.DisplayName : "F9",
                    bindingUndoBoss != null ? bindingUndoBoss.DisplayName : "F10",
                    isHotkeysActive ? "true" : "false"
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
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;
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
