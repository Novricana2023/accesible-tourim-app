import { describe, expect, it } from "vitest";
import { isLikelyStaticAssetResponse } from "@/lib/assetResponse";

describe("isLikelyStaticAssetResponse", () => {
  it("rejects HTML SPA fallthrough for model URLs", () => {
    const response = new Response("", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    expect(isLikelyStaticAssetResponse(response, "/models/yolov8n.onnx")).toBe(false);
  });

  it("accepts binary model responses", () => {
    const response = new Response("", {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
    expect(isLikelyStaticAssetResponse(response, "/models/yolov8n.onnx")).toBe(true);
  });
});
