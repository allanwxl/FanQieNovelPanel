import { fanqieEndpoints, fanqieGet } from "../client/fanqieApi";
import { syncFanqieData } from "../sync/fanqieSync";

const sanitizeResult = (result: unknown) => {
  const text = JSON.stringify(result);
  return text.length > 8000 ? `${text.slice(0, 8000)}...` : text;
};

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
      // Older Chromium builds may not support this API. The popup remains available.
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "fanqie:probe-login") {
    fanqieGet({ path: fanqieEndpoints.userInfo })
      .then((result) => sendResponse({ ok: result.code === 0, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "fanqie:probe-apis") {
    const bookId = String(message.bookId || "7636231301661477950");
    const today = new Date();
    const end = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const format = (date: Date) => date.toISOString().slice(0, 10);

    Promise.allSettled([
      fanqieGet({ path: fanqieEndpoints.userInfo }),
      fanqieGet({ path: fanqieEndpoints.shortStatsSingleCommon, query: { book_id: bookId } }),
      fanqieGet({
        path: fanqieEndpoints.shortStatsSingleByDate,
        query: { book_id: bookId, start_date: format(start), end_date: format(end) }
      }),
      fanqieGet({
        path: fanqieEndpoints.shortStatsBookList,
        query: {
          page_index: 0,
          page_count: 10,
          image_fmt_list: "450x800",
          book_image_fmt_list: "190x250",
          book_id: bookId
        }
      }),
      fanqieGet({
        path: fanqieEndpoints.shortArticleList,
        query: {
          page_index: 0,
          page_count: 10,
          status: 0,
          time_sort: 0,
          image_fmt_list: "450x800",
          book_image_fmt_list: "190x250",
          pack_type: 1
        }
      })
    ])
      .then((results) => {
        const labels = ["userInfo", "singleCommon", "singleByDate", "statsBookList", "shortArticleList"];
        sendResponse({
          ok: true,
          bookId,
          checkedAt: new Date().toISOString(),
          results: results.map((result, index) => ({
            name: labels[index],
            status: result.status,
            body: result.status === "fulfilled" ? sanitizeResult(result.value) : String(result.reason)
          }))
        });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "fanqie:sync") {
    syncFanqieData()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
