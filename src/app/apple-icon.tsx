import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const bar = (left: number, top: number, height: number, color: string) => (
  <div style={{ position: "absolute", left, top, width: 22, height, borderRadius: 7, background: color }} />
);

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#ffffff", display: "flex", position: "relative" }}>
        {bar(33, 53, 74, "#FEBD59")}
        {bar(59, 53, 30, "#FF914C")}
        {bar(99, 53, 74, "#38B6FF")}
        {bar(125, 97, 30, "#8F52F8")}
      </div>
    ),
    size,
  );
}
