import YahooFinance from "yahoo-finance2";

/**
 * Shared Yahoo Finance client. Keeping construction in one module prevents
 * every integration from repeating untyped CommonJS/ESM interop casts.
 *
 * Vitest tests may provide a lightweight object-shaped module mock rather than
 * the production constructor. The runtime guard preserves that mock shape while
 * the normal application path constructs the real client.
 */
type YahooFinanceClient = InstanceType<typeof YahooFinance>;
type YahooFinanceConstructor = new (
  options?: ConstructorParameters<typeof YahooFinance>[0],
) => YahooFinanceClient;

type YahooFinanceExport = YahooFinanceConstructor | YahooFinanceClient;
const yahooFinanceExport = YahooFinance as unknown as YahooFinanceExport;

export const yahooFinance: YahooFinanceClient =
  typeof yahooFinanceExport === "function"
    ? new yahooFinanceExport({ suppressNotices: ["yahooSurvey"] })
    : yahooFinanceExport;
