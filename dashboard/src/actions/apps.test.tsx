import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import { getType } from "typesafe-actions";

import actions from ".";
import { App } from "../shared/App";
import Chart from "../shared/Chart";
import { definedNamespaces } from "../shared/Namespace";
import { IAppState, UnprocessableEntity } from "../shared/types";

const mockStore = configureMockStore([thunk]);

let store: any;

beforeEach(() => {
  const state: IAppState = {
    isFetching: false,
    items: [],
    listingAll: false,
  };
  store = mockStore({
    apps: {
      state,
    },
    config: {
      namespace: "kubeapps-ns",
    },
  });
});

describe("fetches applications", () => {
  let listAppsMock: jest.Mock;
  beforeEach(() => {
    listAppsMock = jest.fn(() => []);
    App.listApps = listAppsMock;
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("fetches all applications", async () => {
    const expectedActions = [
      { type: getType(actions.apps.listApps), payload: true },
      { type: getType(actions.apps.receiveAppList), payload: [] },
    ];
    await store.dispatch(actions.apps.fetchAppsWithUpdateInfo("default", true));
    expect(store.getActions()).toEqual(expectedActions);
    expect(listAppsMock.mock.calls[0]).toEqual(["default", true]);
  });
  it("fetches default applications", async () => {
    const expectedActions = [
      { type: getType(actions.apps.listApps), payload: false },
      { type: getType(actions.apps.receiveAppList), payload: [] },
    ];
    await store.dispatch(actions.apps.fetchAppsWithUpdateInfo("default", false));
    expect(store.getActions()).toEqual(expectedActions);
    expect(listAppsMock.mock.calls[0]).toEqual(["default", false]);
  });

  describe("fetches chart updates", () => {
    it("gets a chart latest version", async () => {
      const appsResponse = [
        {
          releaseName: "foobar",
          chartMetadata: { name: "foo", version: "1.0.0", appVersion: "0.1.0" },
        },
      ];
      const chartUpdatesResponse = [
        {
          attributes: { repo: { name: "bar" } },
          relationships: { latestChartVersion: { data: { version: "1.1.0" } } },
        },
      ];
      Chart.listWithFilters = jest.fn(() => chartUpdatesResponse);
      App.listApps = jest.fn(() => appsResponse);
      const expectedActions = [
        { type: getType(actions.apps.listApps), payload: false },
        { type: getType(actions.apps.receiveAppList), payload: appsResponse },
        { type: getType(actions.apps.requestAppUpdateInfo) },
        {
          type: getType(actions.apps.receiveAppUpdateInfo),
          payload: {
            releaseName: "foobar",
            updateInfo: { upToDate: false, latestVersion: "1.1.0", repository: { name: "bar" } },
          },
        },
      ];
      await store.dispatch(actions.apps.fetchAppsWithUpdateInfo("default", false));
      expect(store.getActions()).toEqual(expectedActions);
    });

    it("set up upToDate=true if the application is up to date", async () => {
      const appsResponse = [
        {
          releaseName: "foobar",
          chartMetadata: { name: "foo", version: "1.0.0", appVersion: "0.1.0" },
        },
      ];
      const chartUpdatesResponse = [
        {
          attributes: { repo: { name: "bar" } },
          relationships: { latestChartVersion: { data: { version: "1.0.0" } } },
        },
      ];
      Chart.listWithFilters = jest.fn(() => chartUpdatesResponse);
      App.listApps = jest.fn(() => appsResponse);
      const expectedActions = [
        { type: getType(actions.apps.listApps), payload: false },
        { type: getType(actions.apps.receiveAppList), payload: appsResponse },
        { type: getType(actions.apps.requestAppUpdateInfo) },
        {
          type: getType(actions.apps.receiveAppUpdateInfo),
          payload: {
            releaseName: "foobar",
            updateInfo: { upToDate: true, latestVersion: "1.0.0", repository: { name: "bar" } },
          },
        },
      ];
      await store.dispatch(actions.apps.fetchAppsWithUpdateInfo("default", false));
      expect(store.getActions()).toEqual(expectedActions);
    });

    it("set an error if the application version is not semver compatible", async () => {
      const appsResponse = [
        {
          releaseName: "foobar",
          chartMetadata: { name: "foo", version: "1.0", appVersion: "0.1.0" },
        },
      ];
      const chartUpdatesResponse = [
        {
          attributes: { repo: { name: "bar" } },
          relationships: { latestChartVersion: { data: { version: "1.0" } } },
        },
      ];
      Chart.listWithFilters = jest.fn(() => chartUpdatesResponse);
      App.listApps = jest.fn(() => appsResponse);
      const expectedActions = [
        { type: getType(actions.apps.listApps), payload: false },
        { type: getType(actions.apps.receiveAppList), payload: appsResponse },
        { type: getType(actions.apps.requestAppUpdateInfo) },
        {
          type: getType(actions.apps.receiveAppUpdateInfo),
          payload: {
            releaseName: "foobar",
            updateInfo: {
              error: new Error("Invalid Version: 1.0"),
              upToDate: false,
              latestVersion: "",
              repository: { name: "", url: "" },
            },
          },
        },
      ];
      await store.dispatch(actions.apps.fetchAppsWithUpdateInfo("default", false));
      expect(store.getActions()).toEqual(expectedActions);
    });
  });
});

describe("delete applications", () => {
  const deleteAppOrig = App.delete;
  let deleteAppMock: jest.Mock;
  beforeEach(() => {
    deleteAppMock = jest.fn(() => []);
    App.delete = deleteAppMock;
  });
  afterEach(() => {
    App.delete = deleteAppOrig;
  });
  it("delete an application", async () => {
    await store.dispatch(actions.apps.deleteApp("foo", "default", false));
    expect(store.getActions()).toEqual([]);
    expect(deleteAppMock.mock.calls[0]).toEqual(["foo", "default", false]);
  });
  it("delete and purge an application", async () => {
    await store.dispatch(actions.apps.deleteApp("foo", "default", true));
    expect(store.getActions()).toEqual([]);
    expect(deleteAppMock.mock.calls[0]).toEqual(["foo", "default", true]);
  });
  it("delete and throw an error", async () => {
    const error = new Error("something went wrong!");
    const expectedActions = [{ type: getType(actions.apps.errorDeleteApp), payload: error }];
    deleteAppMock.mockImplementation(() => {
      throw error;
    });
    expect(await store.dispatch(actions.apps.deleteApp("foo", "default", true))).toBe(false);
    expect(store.getActions()).toEqual(expectedActions);
  });
});

describe("deploy chart", () => {
  beforeEach(() => {
    App.create = jest.fn();
  });

  it("returns true if namespace is correct and deployment is successful", async () => {
    const res = await store.dispatch(
      actions.apps.deployChart("my-version" as any, "my-release", "default"),
    );
    expect(res).toBe(true);
    expect(App.create).toHaveBeenCalledWith(
      "my-release",
      "default",
      "kubeapps-ns",
      "my-version",
      undefined,
    );
    expect(store.getActions().length).toBe(0);
  });

  it("returns false and dispatches UnprocessableEntity if the namespace is _all", async () => {
    const res = await store.dispatch(
      actions.apps.deployChart("my-version" as any, "my-release", definedNamespaces.all),
    );
    expect(res).toBe(false);
    expect(store.getActions().length).toBe(1);
    expect(store.getActions()[0].type).toEqual(getType(actions.apps.errorApps));
    expect(store.getActions()[0].payload.constructor).toBe(UnprocessableEntity);
  });
});

describe("upgradeApp", () => {
  const provisionCMD = actions.apps.upgradeApp(
    "my-version" as any,
    "my-release",
    definedNamespaces.all,
  );

  it("calls ServiceBinding.delete and returns true if no error", async () => {
    App.upgrade = jest.fn().mockImplementationOnce(() => true);
    const res = await store.dispatch(provisionCMD);
    expect(res).toBe(true);

    expect(store.getActions().length).toBe(0);
    expect(App.upgrade).toHaveBeenCalledWith(
      "my-release",
      definedNamespaces.all,
      "kubeapps-ns",
      "my-version" as any,
      undefined,
    );
  });

  it("dispatches errorCatalog if error", async () => {
    App.upgrade = jest.fn().mockImplementationOnce(() => {
      throw new Error("Boom!");
    });

    const expectedActions = [
      {
        type: getType(actions.apps.errorApps),
        payload: new Error("Boom!"),
      },
    ];

    await store.dispatch(provisionCMD);
    expect(store.getActions()).toEqual(expectedActions);
  });
});
