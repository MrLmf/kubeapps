import { RouterAction } from "connected-react-router";
import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as React from "react";

import AccessURLTable from "../../containers/AccessURLTableContainer";
import ApplicationStatus from "../../containers/ApplicationStatusContainer";
import ResourceRef from "../../shared/ResourceRef";
import { IK8sList, IRBACRole, IRelease, IResource } from "../../shared/types";
import { ErrorSelector } from "../ErrorAlert";
import LoadingWrapper from "../LoadingWrapper";
import AppControls from "./AppControls";
import AppNotes from "./AppNotes";
import "./AppView.css";
import ChartInfo from "./ChartInfo";
import OtherResourcesTable from "./OtherResourcesTable";
import SecretsTable from "./SecretsTable";
import ServicesTable from "./ServicesTable";
import WorkloadTable from "./WorkloadTable";

export interface IAppViewProps {
  namespace: string;
  releaseName: string;
  app: IRelease;
  // TODO(miguel) how to make optional props? I tried adding error? but the container complains
  error: Error | undefined;
  deleteError: Error | undefined;
  getAppWithUpdateInfo: (releaseName: string, namespace: string) => void;
  deleteApp: (releaseName: string, namespace: string, purge: boolean) => Promise<boolean>;
  push: (location: string) => RouterAction;
}

interface IAppViewState {
  deployRefs: ResourceRef[];
  statefulSetRefs: ResourceRef[];
  daemonSetRefs: ResourceRef[];
  serviceRefs: ResourceRef[];
  ingressRefs: ResourceRef[];
  secretRefs: ResourceRef[];
  // Other resources are not IKubeItems because
  // we are not fetching any information for them.
  otherResources: IResource[];
  manifest: IResource[];
}

interface IPartialAppViewState {
  deployRefs: ResourceRef[];
  statefulSetRefs: ResourceRef[];
  daemonSetRefs: ResourceRef[];
  serviceRefs: ResourceRef[];
  ingressRefs: ResourceRef[];
  secretRefs: ResourceRef[];
  otherResources: IResource[];
}

const RequiredRBACRoles: { [s: string]: IRBACRole[] } = {
  view: [
    {
      apiGroup: "apps",
      resource: "deployments",
      verbs: ["list", "watch"],
    },
    {
      apiGroup: "apps",
      resource: "services",
      verbs: ["list", "watch"],
    },
  ],
};

class AppView extends React.Component<IAppViewProps, IAppViewState> {
  public state: IAppViewState = {
    manifest: [],
    ingressRefs: [],
    deployRefs: [],
    statefulSetRefs: [],
    daemonSetRefs: [],
    otherResources: [],
    serviceRefs: [],
    secretRefs: [],
  };

  public async componentDidMount() {
    const { releaseName, getAppWithUpdateInfo, namespace } = this.props;
    getAppWithUpdateInfo(releaseName, namespace);
  }

  // componentWillReceiveProps is deprecated use componentDidUpdate instead
  public componentWillReceiveProps(nextProps: IAppViewProps) {
    const { releaseName, getAppWithUpdateInfo, namespace } = this.props;
    if (nextProps.namespace !== namespace) {
      getAppWithUpdateInfo(releaseName, nextProps.namespace);
      return;
    }
    if (nextProps.error) {
      return;
    }
    const newApp = nextProps.app;
    if (!newApp) {
      return;
    }

    // TODO(prydonius): Okay to use non-safe load here since we assume the
    // manifest is pre-parsed by Helm and Kubernetes. Look into switching back
    // to safeLoadAll once https://github.com/nodeca/js-yaml/issues/456 is
    // resolved.
    let manifest: IResource[] = yaml.loadAll(newApp.manifest, undefined, { json: true });
    // Filter out elements in the manifest that does not comply
    // with { kind: foo }
    manifest = manifest.filter(r => r && r.kind);
    if (!_.isEqual(manifest, this.state.manifest)) {
      this.setState({ manifest });
    } else {
      return;
    }

    // Iterate over the current manifest to populate the initial state
    this.setState(this.parseResources(manifest, newApp.namespace));
  }

  public render() {
    if (this.props.error) {
      return (
        <ErrorSelector
          error={this.props.error}
          defaultRequiredRBACRoles={RequiredRBACRoles}
          action="view"
          resource={`Application ${this.props.releaseName}`}
          namespace={this.props.namespace}
        />
      );
    }

    return this.props.app && this.props.app.info ? this.appInfo() : <LoadingWrapper />;
  }

  public appInfo() {
    const { app, push } = this.props;
    const {
      serviceRefs,
      ingressRefs,
      deployRefs,
      statefulSetRefs,
      daemonSetRefs,
      secretRefs,
      otherResources,
    } = this.state;
    return (
      <section className="AppView padding-b-big">
        <main>
          <div className="container">
            {this.props.deleteError && (
              <ErrorSelector
                error={this.props.deleteError}
                defaultRequiredRBACRoles={RequiredRBACRoles}
                action="delete"
                resource={`Application ${this.props.releaseName}`}
                namespace={this.props.namespace}
              />
            )}
            <div className="row collapse-b-tablet">
              <div className="col-3">
                <ChartInfo app={app} />
              </div>
              <div className="col-9">
                <div className="row padding-t-bigger">
                  <div className="col-4">
                    <ApplicationStatus
                      deployRefs={deployRefs}
                      statefulsetRefs={statefulSetRefs}
                      daemonsetRefs={daemonSetRefs}
                      info={app.info!}
                    />
                  </div>
                  <div className="col-8 text-r">
                    <AppControls app={app} deleteApp={this.deleteApp} push={push} />
                  </div>
                </div>
                <AccessURLTable serviceRefs={serviceRefs} ingressRefs={ingressRefs} />
                <AppNotes notes={app.info && app.info.status && app.info.status.notes} />
                <SecretsTable secretRefs={secretRefs} />
                <WorkloadTable
                  resourceRefs={deployRefs}
                  title="Deployments"
                  status={{
                    DESIRED: "replicas",
                    "UP-TO-DATE": "updatedReplicas",
                    AVAILABLE: "availableReplicas",
                  }}
                />
                <WorkloadTable
                  resourceRefs={statefulSetRefs}
                  title="StatefulSets"
                  status={{
                    DESIRED: "replicas",
                    "UP-TO-DATE": "updatedReplicas",
                    READY: "readyReplicas",
                  }}
                />
                <WorkloadTable
                  resourceRefs={daemonSetRefs}
                  title="DaemonSets"
                  status={{
                    DESIRED: "currentNumberScheduled",
                    AVAILABLE: "numberReady",
                  }}
                />
                <ServicesTable serviceRefs={serviceRefs} />
                <OtherResourcesTable otherResources={otherResources} />
              </div>
            </div>
          </div>
        </main>
      </section>
    );
  }

  private parseResources(
    resources: Array<IResource | IK8sList<IResource, {}>>,
    releaseNamespace: string,
  ): IPartialAppViewState {
    const result: IPartialAppViewState = {
      ingressRefs: [],
      deployRefs: [],
      statefulSetRefs: [],
      daemonSetRefs: [],
      otherResources: [],
      serviceRefs: [],
      secretRefs: [],
    };
    resources.forEach(i => {
      // The item may be a list
      const itemList = i as IK8sList<IResource, {}>;
      if (itemList.items) {
        // If the resource  has a list of items, treat them as a list
        // A List can contain an arbitrary set of resources so we treat them as an
        // additional manifest. We merge the current result with the resources of
        // the List, concatenating items from both.
        _.assignWith(
          result,
          this.parseResources((i as IK8sList<IResource, {}>).items, releaseNamespace),
          // Merge the list with the current result
          (prev, newArray) => prev.concat(newArray),
        );
      } else {
        const item = i as IResource;
        const resource = { isFetching: true, item };
        switch (i.kind) {
          case "Deployment":
            result.deployRefs.push(new ResourceRef(resource.item, releaseNamespace));
            break;
          case "StatefulSet":
            result.statefulSetRefs.push(new ResourceRef(resource.item, releaseNamespace));
            break;
          case "DaemonSet":
            result.daemonSetRefs.push(new ResourceRef(resource.item, releaseNamespace));
            break;
          case "Service":
            result.serviceRefs.push(new ResourceRef(resource.item, releaseNamespace));
            break;
          case "Ingress":
            result.ingressRefs.push(new ResourceRef(resource.item, releaseNamespace));
            break;
          case "Secret":
            result.secretRefs.push(new ResourceRef(resource.item, releaseNamespace));
            break;
          default:
            result.otherResources.push(item);
        }
      }
    });
    return result;
  }

  private deleteApp = (purge: boolean) => {
    return this.props.deleteApp(this.props.releaseName, this.props.namespace, purge);
  };
}

export default AppView;
