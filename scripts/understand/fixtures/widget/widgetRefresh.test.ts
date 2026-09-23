import { refreshWidget } from "./widgetRefresh";

describe("刷新 Widget", () => {
  it("缺少 id 时拒绝", () => {
    refreshWidget("");
  });
});
