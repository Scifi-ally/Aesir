import fs from "fs";
import zlib from "zlib";

type Instrument = { trading_symbol?: string };

const cachePath = "NSE.json.gz";
if (fs.existsSync(cachePath)) {
  const fileBuf = fs.readFileSync(cachePath);
  let text: string;
  try {
    text = zlib.gunzipSync(fileBuf).toString("utf-8");
  } catch {
    text = fileBuf.toString("utf-8");
  }
  const instruments = JSON.parse(text) as unknown[];
  const gandhar = instruments.find((item): item is Instrument => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Record<string, unknown>;
    return candidate.trading_symbol === "GANDHAR";
  });
  if (gandhar) {
    console.log("Found GANDHAR in NSE.json.gz:", gandhar);
  } else {
    console.log("GANDHAR not found in NSE.json.gz");
  }
} else {
  console.log("NSE.json.gz not found");
}
