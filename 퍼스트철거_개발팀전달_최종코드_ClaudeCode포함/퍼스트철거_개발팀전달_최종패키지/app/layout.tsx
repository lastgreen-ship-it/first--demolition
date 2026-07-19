import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "퍼스트철거 | AI 철거 견적·검증업체 경쟁입찰",
  description: "사진으로 빠르게 예상견적을 확인하고 검증된 철거업체의 경쟁입찰을 받아보세요.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
