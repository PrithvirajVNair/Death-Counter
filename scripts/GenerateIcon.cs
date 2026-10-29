using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace IconGenerator {
    class Program {
        static void Main(string[] args) {
            int[] sizes = new int[] { 256, 128, 64, 48, 32, 16 };
            List<byte[]> pngs = new List<byte[]>();

            foreach (int size in sizes) {
                using (Bitmap bmp = DrawCrossedSwords(size))
                using (MemoryStream ms = new MemoryStream()) {
                    bmp.Save(ms, ImageFormat.Png);
                    pngs.Add(ms.ToArray());
                }
            }

            byte[] icoData = CreateIco(pngs, sizes);

            string scriptDir = AppDomain.CurrentDomain.BaseDirectory;
            string outPath1 = Path.Combine(scriptDir, "app.ico");
            string publicDir = Path.Combine(scriptDir, "..", "public");

            File.WriteAllBytes(outPath1, icoData);
            Console.WriteLine("Wrote " + outPath1);

            try {
                File.WriteAllBytes(Path.Combine(publicDir, "app.ico"), icoData);
                File.WriteAllBytes(Path.Combine(publicDir, "favicon.ico"), icoData);

                // Save individual PNGs for optimal browser favicon compatibility
                using (Bitmap b32 = DrawCrossedSwords(32)) {
                    b32.Save(Path.Combine(publicDir, "favicon-32x32.png"), ImageFormat.Png);
                }
                using (Bitmap b16 = DrawCrossedSwords(16)) {
                    b16.Save(Path.Combine(publicDir, "favicon-16x16.png"), ImageFormat.Png);
                }
                using (Bitmap b180 = DrawCrossedSwords(180)) {
                    b180.Save(Path.Combine(publicDir, "apple-touch-icon.png"), ImageFormat.Png);
                }
                using (Bitmap b64 = DrawCrossedSwords(64)) {
                    b64.Save(Path.Combine(publicDir, "favicon.png"), ImageFormat.Png);
                }
                Console.WriteLine("Saved PNG favicons to public dir");
            } catch (Exception ex) {
                Console.WriteLine("Warning copying to public: " + ex.Message);
            }

            Console.WriteLine("ICO & PNGs generated successfully with sizes: 256, 128, 64, 48, 32, 16");
        }

        static Bitmap DrawCrossedSwords(int size) {
            Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                float center = size / 2f;
                float radius = size * 0.47f;
                float scale = size / 64f;

                // Dark backing disc
                using (SolidBrush darkBrush = new SolidBrush(Color.FromArgb(255, 18, 19, 16)))
                using (Pen outerPen = new Pen(Color.FromArgb(255, 61, 50, 29), Math.Max(1f, size * 0.025f)))
                using (Pen innerPen = new Pen(Color.FromArgb(140, 200, 166, 93), Math.Max(0.5f, size * 0.015f))) {
                    g.FillEllipse(darkBrush, center - radius, center - radius, radius * 2, radius * 2);
                    g.DrawEllipse(outerPen, center - radius, center - radius, radius * 2, radius * 2);
                    float r2 = radius * 0.92f;
                    g.DrawEllipse(innerPen, center - r2, center - r2, r2 * 2, r2 * 2);
                }

                Action<float> drawSword = (angle) => {
                    GraphicsState state = g.Save();
                    g.TranslateTransform(center, center);
                    g.RotateTransform(angle);
                    g.TranslateTransform(-center, -center);

                    // Blade Left (bright gold)
                    PointF[] leftBlade = new PointF[] {
                        new PointF(center, 5f * scale),
                        new PointF(center - 2.5f * scale, 13f * scale),
                        new PointF(center - 2.5f * scale, 39f * scale),
                        new PointF(center, 39f * scale)
                    };
                    using (LinearGradientBrush bL = new LinearGradientBrush(
                        new PointF(center - 3f * scale, 5f * scale),
                        new PointF(center, 39f * scale),
                        Color.FromArgb(255, 255, 245, 214),
                        Color.FromArgb(255, 184, 148, 69))) {
                        g.FillPolygon(bL, leftBlade);
                    }

                    // Blade Right (shadow gold)
                    PointF[] rightBlade = new PointF[] {
                        new PointF(center, 5f * scale),
                        new PointF(center + 2.5f * scale, 13f * scale),
                        new PointF(center + 2.5f * scale, 39f * scale),
                        new PointF(center, 39f * scale)
                    };
                    using (LinearGradientBrush bR = new LinearGradientBrush(
                        new PointF(center, 5f * scale),
                        new PointF(center + 3f * scale, 39f * scale),
                        Color.FromArgb(255, 226, 190, 104),
                        Color.FromArgb(255, 110, 85, 35))) {
                        g.FillPolygon(bR, rightBlade);
                    }

                    // Blade spine
                    using (Pen spinePen = new Pen(Color.FromArgb(220, 255, 248, 231), Math.Max(0.5f, 0.6f * scale))) {
                        g.DrawLine(spinePen, center, 6f * scale, center, 38.5f * scale);
                    }

                    // Crossguard
                    PointF[] guard = new PointF[] {
                        new PointF(center - 13f * scale, 39.5f * scale),
                        new PointF(center - 5f * scale, 40.5f * scale),
                        new PointF(center, 40.5f * scale),
                        new PointF(center + 5f * scale, 40.5f * scale),
                        new PointF(center + 13f * scale, 39.5f * scale),
                        new PointF(center + 10f * scale, 42.5f * scale),
                        new PointF(center, 42.5f * scale),
                        new PointF(center - 10f * scale, 42.5f * scale)
                    };
                    using (LinearGradientBrush guardBrush = new LinearGradientBrush(
                        new PointF(center - 13f * scale, 39f * scale),
                        new PointF(center + 13f * scale, 43f * scale),
                        Color.FromArgb(255, 242, 213, 138),
                        Color.FromArgb(255, 143, 110, 40))) {
                        g.FillPolygon(guardBrush, guard);
                    }
                    using (Pen guardBorder = new Pen(Color.FromArgb(255, 74, 58, 23), Math.Max(0.5f, 0.5f * scale))) {
                        g.DrawPolygon(guardBorder, guard);
                    }

                    // Grip
                    RectangleF gripRect = new RectangleF(center - 1.5f * scale, 42.5f * scale, 3f * scale, 11.5f * scale);
                    using (SolidBrush gripBrush = new SolidBrush(Color.FromArgb(255, 28, 22, 13)))
                    using (Pen gripBorder = new Pen(Color.FromArgb(255, 166, 130, 51), Math.Max(0.5f, 0.5f * scale))) {
                        g.FillRectangle(gripBrush, gripRect);
                        g.DrawRectangle(gripBorder, gripRect.X, gripRect.Y, gripRect.Width, gripRect.Height);
                    }
                    using (Pen wrapPen = new Pen(Color.FromArgb(255, 242, 213, 138), Math.Max(0.5f, 0.6f * scale))) {
                        g.DrawLine(wrapPen, center - 1.5f * scale, 45.5f * scale, center + 1.5f * scale, 45.5f * scale);
                        g.DrawLine(wrapPen, center - 1.5f * scale, 48.5f * scale, center + 1.5f * scale, 48.5f * scale);
                        g.DrawLine(wrapPen, center - 1.5f * scale, 51.5f * scale, center + 1.5f * scale, 51.5f * scale);
                    }

                    // Pommel
                    float pommelR = 3.2f * scale;
                    using (SolidBrush pommelBrush = new SolidBrush(Color.FromArgb(255, 215, 175, 80)))
                    using (Pen pommelBorder = new Pen(Color.FromArgb(255, 74, 58, 23), Math.Max(0.5f, 0.5f * scale)))
                    using (SolidBrush rubyBrush = new SolidBrush(Color.FromArgb(255, 139, 30, 30))) {
                        g.FillEllipse(pommelBrush, center - pommelR, 56.5f * scale - pommelR, pommelR * 2, pommelR * 2);
                        g.DrawEllipse(pommelBorder, center - pommelR, 56.5f * scale - pommelR, pommelR * 2, pommelR * 2);
                        float rubyR = 1.3f * scale;
                        g.FillEllipse(rubyBrush, center - rubyR, 56.5f * scale - rubyR, rubyR * 2, rubyR * 2);
                    }

                    g.Restore(state);
                };

                drawSword(-45f);
                drawSword(45f);

                // Center crossing boss emblem
                float emblemR = 3.6f * scale;
                using (SolidBrush emblemDark = new SolidBrush(Color.FromArgb(255, 18, 19, 16)))
                using (Pen emblemPen = new Pen(Color.FromArgb(255, 242, 213, 138), Math.Max(0.8f, 1.2f * scale)))
                using (SolidBrush emblemGold = new SolidBrush(Color.FromArgb(255, 215, 175, 80)))
                using (SolidBrush emblemCenter = new SolidBrush(Color.FromArgb(255, 255, 245, 214))) {
                    g.FillEllipse(emblemDark, center - emblemR, center - emblemR, emblemR * 2, emblemR * 2);
                    g.DrawEllipse(emblemPen, center - emblemR, center - emblemR, emblemR * 2, emblemR * 2);
                    float rG = 2f * scale;
                    g.FillEllipse(emblemGold, center - rG, center - rG, rG * 2, rG * 2);
                    float rC = 0.8f * scale;
                    g.FillEllipse(emblemCenter, center - rC, center - rC, rC * 2, rC * 2);
                }
            }
            return bmp;
        }

        static byte[] CreateIco(List<byte[]> pngs, int[] sizes) {
            using (MemoryStream ms = new MemoryStream())
            using (BinaryWriter bw = new BinaryWriter(ms)) {
                // ICONDIR header
                bw.Write((short)0);           // Reserved
                bw.Write((short)1);           // Type: 1 = ICO
                bw.Write((short)pngs.Count);  // Count

                int offset = 6 + (16 * pngs.Count);

                for (int i = 0; i < pngs.Count; i++) {
                    int w = sizes[i] >= 256 ? 0 : sizes[i];
                    int h = sizes[i] >= 256 ? 0 : sizes[i];
                    byte[] data = pngs[i];

                    bw.Write((byte)w);          // Width
                    bw.Write((byte)h);          // Height
                    bw.Write((byte)0);          // Colors (0 for truecolor)
                    bw.Write((byte)0);          // Reserved
                    bw.Write((short)1);         // Color planes
                    bw.Write((short)32);        // Bits per pixel
                    bw.Write(data.Length);      // Size of image data
                    bw.Write(offset);           // Offset of image data

                    offset += data.Length;
                }

                // Image data
                foreach (byte[] data in pngs) {
                    bw.Write(data);
                }

                return ms.ToArray();
            }
        }
    }
}
