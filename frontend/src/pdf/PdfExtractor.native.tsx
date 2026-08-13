import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import { PdfPasswordRequiredError, type PdfExtractionResult, type PdfExtractorHandle } from "./types";

const EXTRACTION_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 15000;

type PendingRequest = {
  resolve: (result: PdfExtractionResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const PdfExtractor = forwardRef<PdfExtractorHandle>((_props, ref) => {
  const webViewRef = useRef<WebView>(null);
  const pendingRef = useRef<PendingRequest | null>(null);
  const readyRef = useRef(false);
  const readyWaitersRef = useRef<Array<() => void>>([]);
  const [htmlUri, setHtmlUri] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const asset = Asset.fromModule(require("../../assets/pdf/pdf-extract.html"));
        await asset.downloadAsync();
        if (!cancelled) setHtmlUri(asset.localUri || asset.uri);
      } catch {
        // extract() will time out and surface a clear error if the asset never loads.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const waitUntilReady = () =>
    new Promise<void>((resolve, reject) => {
      if (readyRef.current) {
        resolve();
        return;
      }
      const timeoutId = setTimeout(() => {
        readyWaitersRef.current = readyWaitersRef.current.filter((w) => w !== onReady);
        reject(new Error("Couldn't start the PDF reader — try again."));
      }, READY_TIMEOUT_MS);
      const onReady = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      readyWaitersRef.current.push(onReady);
    });

  useImperativeHandle(ref, () => ({
    extract: async (base64: string, password?: string) => {
      if (pendingRef.current) {
        throw new Error("An extraction is already in progress.");
      }
      await waitUntilReady();

      return new Promise<PdfExtractionResult>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRef.current = null;
          reject(new Error("Extraction is taking too long — try a smaller PDF."));
        }, EXTRACTION_TIMEOUT_MS);

        pendingRef.current = { resolve, reject, timeoutId };
        webViewRef.current?.postMessage(JSON.stringify({ type: "EXTRACT", base64, password }));
      });
    },
  }));

  const onMessage = (event: { nativeEvent: { data: string } }) => {
    let msg: any;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (msg?.type === "READY") {
      readyRef.current = true;
      readyWaitersRef.current.forEach((resolve) => resolve());
      readyWaitersRef.current = [];
      return;
    }

    const pending = pendingRef.current;
    if (!pending) return;

    if (msg?.type === "RESULT") {
      clearTimeout(pending.timeoutId);
      pendingRef.current = null;
      pending.resolve({ pages: msg.pages || [], pageCount: (msg.pages || []).length });
    } else if (msg?.type === "PASSWORD_REQUIRED") {
      clearTimeout(pending.timeoutId);
      pendingRef.current = null;
      pending.reject(new PdfPasswordRequiredError(!!msg.needsRetry));
    } else if (msg?.type === "ERROR") {
      clearTimeout(pending.timeoutId);
      pendingRef.current = null;
      pending.reject(new Error(msg.message || "Couldn't read this PDF. It may be password-protected or corrupted."));
    }
  };

  if (!htmlUri) return null;

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: htmlUri }}
      onMessage={onMessage}
      originWhitelist={["*"]}
      style={{ width: 0, height: 0, position: "absolute" }}
      javaScriptEnabled
    />
  );
});

PdfExtractor.displayName = "PdfExtractor";

export default PdfExtractor;
