"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { resizeImageDataUrl } from "@/lib/image-resize";

/**
 * Photo-OCR uploader. Sits next to (not inside) the MathLive editor
 * as a parallel input path. Promise to the student: typing remains
 * the primary flow — this is a shortcut. The OCR result lands in the
 * editor as an editable initial value; the student MUST review.
 *
 * Resize-before-upload happens client-side because:
 *  - Mobile phones routinely produce 4000x3000 JPEG (5-8MB). Sending
 *    that to GPT-4o costs 5-10x more in tokens and takes 8-15s. The
 *    OCR doesn't gain accuracy past ~1280px on the long edge.
 *  - We don't need to provision a temp-file storage server in
 *    Sprint 1 — the resized data: URL is small enough to send in
 *    the tRPC request body directly.
 *
 * Confidence display: we make the model's self-reported confidence
 * visible in the same affordance the student is about to act on. The
 * student needs to know "this OCR thinks it nailed it" vs "this OCR
 * is uncertain" before they paste into MathLive.
 */

export type OcrUploadResult =
  | {
      ok: true;
      latex: string;
      confidence: "high" | "medium" | "low" | "none";
      notes: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

export type HandwritingOcrUploaderProps = {
  /**
   * Called when the OCR call returns. The parent (typically the step
   * editor) decides what to do — usually push `latex` into the
   * MathLive editor as its initial value, then let the student edit.
   */
  onOcrResult: (result: OcrUploadResult) => void;
  /**
   * Async function that the parent supplies to actually call the
   * server. We inject it instead of importing tRPC directly so this
   * component is unit-testable without spinning up a tRPC harness.
   * Should resolve to the server's OCR result shape.
   */
  callOcr: (imageDataUrl: string) => Promise<OcrUploadResult>;
  /**
   * UI locale for button labels and hint text. Defaults to English.
   */
  locale?: "en" | "zh";
  /**
   * When true, the uploader is disabled (e.g. parent is saving a step
   * and doesn't want concurrent OCR muddying state).
   */
  disabled?: boolean;
};

// Resize helper now lives in @/lib/image-resize (Sprint 2 refactor) so
// the multi-step uploader can share the same logic.

type Phase = "idle" | "resizing" | "calling" | "success" | "error";

const LABELS: Record<"en" | "zh", {
  trigger: string;
  resizing: string;
  calling: string;
  hint: string;
  errorGeneric: string;
  errorTooBig: string;
  errorWrongType: string;
  retry: string;
  cancel: string;
}> = {
  en: {
    trigger: "📷 Scan handwritten step",
    resizing: "Preparing image…",
    calling: "Reading your work…",
    hint: "Take or pick a clear photo of just one step. You'll review the result before saving.",
    errorGeneric: "OCR didn't work. Try typing the step instead, or try a clearer photo.",
    errorTooBig: "That image is too large. Try a smaller photo (under 10 MB).",
    errorWrongType: "That doesn't look like an image. Upload a JPG, PNG or WebP.",
    retry: "Try again",
    cancel: "Cancel"
  },
  zh: {
    trigger: "📷 拍照识别这步",
    resizing: "处理图片中…",
    calling: "正在识别你的手写…",
    hint: "对单独一步拍清楚照片。识别后你可以校对再保存。",
    errorGeneric: "识别失败。可以直接打字，或换一张更清楚的照片再试。",
    errorTooBig: "图片太大，请换小于 10MB 的照片。",
    errorWrongType: "这不是图片。请上传 JPG、PNG 或 WebP 格式。",
    retry: "再试一次",
    cancel: "取消"
  }
};

export function HandwritingOcrUploader({
  onOcrResult,
  callOcr,
  locale = "en",
  disabled = false
}: HandwritingOcrUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKey, setErrorKey] = useState<
    "generic" | "tooBig" | "wrongType" | null
  >(null);
  const labels = LABELS[locale];

  const trigger = useCallback(() => {
    if (disabled || phase === "resizing" || phase === "calling") return;
    fileInputRef.current?.click();
  }, [disabled, phase]);

  const reset = useCallback(() => {
    setPhase("idle");
    setErrorKey(null);
    // Crucial: clear the input value, otherwise picking the same file
    // a second time won't fire onChange (the browser thinks nothing
    // changed). Common gotcha.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Hard upfront rejections — saves a useless resize attempt.
      if (!file.type.startsWith("image/")) {
        setPhase("error");
        setErrorKey("wrongType");
        return;
      }
      // 10MB pre-resize cap. Resizing a 30MB photo would jank the
      // main thread for seconds on mid-range phones.
      if (file.size > 10 * 1024 * 1024) {
        setPhase("error");
        setErrorKey("tooBig");
        return;
      }

      try {
        setPhase("resizing");
        const dataUrl = await resizeImageDataUrl(file);

        setPhase("calling");
        const result = await callOcr(dataUrl);

        if (result.ok) {
          setPhase("success");
          onOcrResult(result);
          // Small delay before reset so the success state is visible
          // briefly. Helps users feel the action completed.
          setTimeout(reset, 400);
        } else {
          setPhase("error");
          setErrorKey("generic");
          onOcrResult(result);
        }
      } catch (err) {
        console.error("[handwriting-ocr] failed", err);
        setPhase("error");
        setErrorKey("generic");
        onOcrResult({ ok: false, reason: "client_exception" });
      }
    },
    [callOcr, onOcrResult, reset]
  );

  const isBusy = phase === "resizing" || phase === "calling";

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        // capture="environment" hints to mobile browsers to open the
        // rear camera directly. On desktop it's silently ignored and
        // the standard file picker opens. Best of both worlds.
        capture="environment"
        className="sr-only"
        onChange={handleFile}
        disabled={disabled || isBusy}
        aria-hidden
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={trigger}
          disabled={disabled || isBusy}
          aria-label={labels.trigger}
        >
          {isBusy
            ? phase === "resizing"
              ? labels.resizing
              : labels.calling
            : labels.trigger}
        </button>

        {phase === "error" ? (
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700"
            onClick={reset}
          >
            {labels.retry}
          </button>
        ) : null}
      </div>

      {phase === "idle" ? (
        <p className="text-[11px]" style={{ color: "var(--subtle)" }}>
          {labels.hint}
        </p>
      ) : null}

      {phase === "error" && errorKey ? (
        <p className="text-xs text-red-600" role="alert">
          {errorKey === "tooBig"
            ? labels.errorTooBig
            : errorKey === "wrongType"
              ? labels.errorWrongType
              : labels.errorGeneric}
        </p>
      ) : null}
    </div>
  );
}
