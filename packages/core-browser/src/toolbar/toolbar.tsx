import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useInjectable } from '../react-hooks';
import { IToolbarRegistry, ToolbarActionGroupsChangedEvent, IToolbarAction, ISize, ToolbarActionsChangedEvent, IToolbarLocationProps, IToolbarLocationPreference } from './types';
import { IEventBus, Disposable, Emitter } from '@ali/ide-core-common';
import { ConfigContext, ConfigProvider, AppConfig } from '../react-providers';
import debounce = require('lodash.debounce');
import { getIcon } from '../style/icon/icon';
import { DomListener } from '../utils';
import { ToolbarActionBtnClickEvent } from './components';

// TODO: use preference
export const DEFAULT_TOOLBAR_ACTION_MARGIN = 5;
export const DEFAULT_TOOLBAR_MORE_WIDTH = 14;

declare var ResizeObserver: any;

const renderedActions = new Map<string, ToolbarActionRenderer>();

const elementSizeDiffEmitter: Emitter<string> = new Emitter();

export const ToolbarLocation = (props: IToolbarLocationProps & React.HTMLAttributes<HTMLDivElement>) => {

  const registry: IToolbarRegistry = useInjectable(IToolbarRegistry);
  if (!registry.hasLocation(props.location)) {
    registry.addLocation(props.location);
  }
  const context: AppConfig = React.useContext(ConfigContext);
  const eventBus: IEventBus = useInjectable(IEventBus);
  const container = React.useRef<HTMLDivElement>();
  const { location, preferences = {} } = props;

  React.useEffect(() => {
    if (container.current) {
      const disposer = new Disposable();
      const debouncedUpdate = debounce(() => {
        if (container.current) {
          renderToolbarLocation(container.current, location, preferences, registry, context, eventBus);
        }
      }, 200, { maxWait: 500});
      disposer.addDispose(eventBus.on(ToolbarActionGroupsChangedEvent, (e) => {
        if (e.payload.location === location) {
          debouncedUpdate();
        }
      }));
      disposer.addDispose(eventBus.on(ToolbarActionsChangedEvent, (e) => {
        if (e.payload.position.location === location) {
          debouncedUpdate();
        }
      }));
      disposer.addDispose(elementSizeDiffEmitter.event((actionId) => {
        const position = registry.getActionPosition(actionId);
        if (position && position.location === location) {
          debouncedUpdate();
        }
      }));
      if (!preferences.noDropDown) {
        let previousWidth = container.current.offsetWidth;
        renderToolbarLocation(container.current, location, preferences, registry, context, eventBus);
        const observer = new ResizeObserver((entries) => {
          const contentRect = entries[0].contentRect;
          if (contentRect.width !== previousWidth) {
            debouncedUpdate();
          }
          previousWidth = contentRect.width;
        });
        observer.observe(container.current);
        disposer.addDispose({
        dispose: () => {
            return observer.disconnect();
          },
        });
      } else {
        renderToolbarLocation(container.current, location, preferences, registry, context, eventBus);
      }
      return () => disposer.dispose();
    }
  }, []);

  return <div {...props} className={'kt-toolbar-location ' + props.className} id={'toolbar-location-' + location} ref={container as any} ></div>;

};

interface ActionSplit {
  type: 'split';
}

function isActionSplit(target: IToolbarAction | ActionSplit): target is ActionSplit {
  return (target as ActionSplit).type === 'split';
}

function renderToolbarLocation(container: HTMLDivElement, location: string, preference: IToolbarLocationPreference, registry: IToolbarRegistry, context: AppConfig, eventBus: IEventBus) {
  const TOOLBAR_ACTION_MARGIN = preference.actionMargin === undefined ? DEFAULT_TOOLBAR_ACTION_MARGIN : preference.actionMargin;
  const TOOLBAR_MORE_WIDTH = preference.moreActionWidth === undefined ? DEFAULT_TOOLBAR_MORE_WIDTH : preference.moreActionWidth;

  for (let i = 0; i < container.children.length ; i++) {
    container.children[i].remove();
    i--;
  }

  const locationContainer = document.createElement('div');
  const locationVisibleContainer = document.createElement('div');
  locationVisibleContainer.classList.add('kt-toolbar-location-visible');
  const dropDownId = 'toolbar-location-dropdown-' + location;
  let locationDropDownContainer: HTMLDivElement;
  if (document.getElementById(dropDownId)) {
    locationDropDownContainer = document.getElementById(dropDownId)! as HTMLDivElement;
    for (let i = 0; i <  locationDropDownContainer.children.length ; i++) {
       locationDropDownContainer.children[i].remove();
       i--;
    }
  } else {
    locationDropDownContainer = document.createElement('div');
    locationDropDownContainer.classList.add('kt-toolbar-location-dropdown');
    locationDropDownContainer.id = dropDownId;
  }
  container.append(locationContainer);
  locationContainer.append(locationVisibleContainer);
  document.body.append(locationDropDownContainer);

  const totalWidth = getContentWidth(locationContainer);
  let usedWidth = 0;

  const groups = ['_head', ...(registry.getActionGroups(location) || []).map((g) => g.id), '_tail'];

  const visibleActionsOrSplits: Array<IToolbarAction | ActionSplit> = [];
  let dropDownActionsOrSplits: Array<IToolbarAction | ActionSplit> = [];

  for (const group of groups) {
    const actions = registry.getToolbarActions({location, group});
    if (actions && actions.actions.length > 0) {
      if (visibleActionsOrSplits.length > 0) {
        visibleActionsOrSplits.push({
          type: 'split',
        });
      }
      visibleActionsOrSplits.push(...actions.actions);
    }
  }

  if (!preference.noDropDown) {
    // 根据元素宽度计算哪些在外面，哪些在 dropdown
    for (let i = 0; i < visibleActionsOrSplits.length; i ++) {
      const actionOrSplit = visibleActionsOrSplits[i];
      const elementWidth: number = getActionOrSplitWidth(actionOrSplit, false);

      if (usedWidth + (i !== 0 ? TOOLBAR_ACTION_MARGIN : 0) + elementWidth + TOOLBAR_ACTION_MARGIN + TOOLBAR_MORE_WIDTH > totalWidth ) {
        // 此时，剩余的空间已经不足以容纳当前 action + more 按钮了
        // 判断当前 action 开始到最后的大小，是否小于 more 按钮的宽度
        let restWidth = 0;
        for (let j = i; j < visibleActionsOrSplits.length ; j++ ) {
          restWidth += (j !== 0 ? TOOLBAR_ACTION_MARGIN : 0) + getActionOrSplitWidth( visibleActionsOrSplits[j], false);
        }
        if (restWidth < TOOLBAR_ACTION_MARGIN + TOOLBAR_MORE_WIDTH) {
          // 能容纳, 无需分组
          break;
        } else {
          // 不能容纳，从当前元素处截断
          dropDownActionsOrSplits = visibleActionsOrSplits.splice(i);
          break;
        }
      }
      usedWidth += (i !== 0 ? TOOLBAR_ACTION_MARGIN : 0) + elementWidth;
    }
  }

  // 开始渲染
  visibleActionsOrSplits.forEach((actionOrSplit) => {
    if (isActionSplit(actionOrSplit)) {
      const splitElement = document.createElement('div');
      splitElement.classList.add('kt-toolbar-action-split');
      locationVisibleContainer.append(splitElement);
    } else {
      appendActionToLocationContainer(locationVisibleContainer, actionOrSplit, context, false, preference);
    }
  });

  if (dropDownActionsOrSplits.length > 0) {
    const moreElement = document.createElement('div');
    moreElement.classList.add('kt-toolbar-more', ...getIcon('more').split(' '));
    locationVisibleContainer.append(moreElement);
    moreElement.addEventListener('mousedown', () => {
      showDropDown(moreElement, location, eventBus);
    });
  }

  dropDownActionsOrSplits.forEach((actionOrSplit, i) => {
    if (isActionSplit(actionOrSplit)) {
      if (i === 0) {
        return;
      }
      const splitElement = document.createElement('div');
      splitElement.classList.add('kt-toolbar-action-split');
    } else {
      appendActionToLocationContainer(locationDropDownContainer, actionOrSplit, context, true);
    }
  });

}

function showDropDown(ele, location: string, eventBus: IEventBus) {
  const locationId = 'toolbar-location-' + location;
  const dropDownId = 'toolbar-location-dropdown-' + location;
  const locationElement = document.getElementById(locationId);
  const dropDownElement = document.getElementById(dropDownId);
  if (locationElement && dropDownElement) {
    const pos = locationElement.getBoundingClientRect();
    dropDownElement.style.top = pos.y + pos.height + 'px';
    dropDownElement.style.right = window.innerWidth - pos.x - pos.width + 'px';
    dropDownElement.style.display = 'block';
    setTimeout(() => {
      const disposer = new Disposable();
      disposer.addDispose(new DomListener(ele, 'mousedown', (e: MouseEvent) => {
        e.stopPropagation();
      }));
      disposer.addDispose(new DomListener(dropDownElement, 'mousedown', (e: MouseEvent) => {
        e.stopPropagation();
      }));
      disposer.addDispose(new DomListener(document.body, 'mousedown', (e: MouseEvent) => {
        disposer.dispose();
        dropDownElement.style.display = 'none';
      }));
      disposer.addDispose(eventBus.on(ToolbarActionBtnClickEvent, () => {
        disposer.dispose();
        dropDownElement.style.display = 'none';
      }));
    });
  }

}

function getActionOrSplitWidth(actionOrSplit: IToolbarAction | ActionSplit, inDropDown: boolean) {
  if (isActionSplit(actionOrSplit)) {
      return 1;
  } else {
    // action 的计算逻辑
    const renderedSize = inDropDown ? (renderedActions.get(actionOrSplit.id)?.size.inDropDown) : (renderedActions.get(actionOrSplit.id)?.size.visible);
    return renderedSize ? renderedSize.width : (actionOrSplit.suggestSize ? actionOrSplit.suggestSize.width : 20) ;
  }
}

async function appendActionToLocationContainer(container: HTMLDivElement, toolbarAction: IToolbarAction, context: AppConfig, inDropDown: boolean, preferences?: IToolbarLocationPreference): Promise<void> {
  const actionContainer = document.createElement('div');
  container.appendChild(actionContainer);
  return rendererToolbarActionComponent(toolbarAction, actionContainer, context, inDropDown, preferences);
}

async function rendererToolbarActionComponent(toolbarAction: IToolbarAction, container: HTMLDivElement, context: AppConfig, inDropDown: boolean, preferences?: IToolbarLocationPreference): Promise<void> {

  if (!renderedActions.has(toolbarAction.id)) {
    renderedActions.set(toolbarAction.id, new ToolbarActionRenderer(toolbarAction, context));
  }
  return renderedActions.get(toolbarAction.id)!.attachTo(container, inDropDown, preferences);
}

function getContentWidth(element) {
  const styles = getComputedStyle(element);

  return element.clientWidth
    - parseFloat(styles.paddingLeft)
    - parseFloat(styles.paddingRight);
}

class ToolbarActionRenderer {

  private renderPromise: {
    promise: Promise<HTMLDivElement>,
    cancel: () => void;
    inDropDown: boolean,
    resolved?: HTMLDivElement,
  };

  private targetContainer: HTMLDivElement | undefined;
  private targetInDropDown: boolean = false;
  public size: {
    visible?: ISize,
    inDropDown?: ISize;
  } = {};

  constructor(private toolbarAction, private context: AppConfig) {

  }

  render(inDropDown: boolean, preferences?: IToolbarLocationPreference): Promise<HTMLDivElement> {
    if (this.renderPromise) {
      if (this.renderPromise.inDropDown === inDropDown) {
        return this.renderPromise.promise;
      }
    }
    // 取消上一次渲染
    if (this.renderPromise) {
      this.renderPromise.cancel();
    }
    return this.doRender(inDropDown, preferences);
  }

  get element(): HTMLDivElement | undefined {
    return this.renderPromise && this.renderPromise.resolved;
  }

  attachTo(container: HTMLDivElement, inDropDown: boolean, preferences?: IToolbarLocationPreference): Promise<void> {
    this.targetContainer = container;
    this.targetInDropDown = inDropDown;
    return this.render(inDropDown, preferences).then((element) => {
      if (this.targetContainer === container && inDropDown === this.targetInDropDown) {
        if (element.parentElement) {
          element.remove();
        }
        container.append(element);
        setTimeout(() => {
          if (!element || element.offsetWidth === 0) {
            return;
          }
          let previousSize;
          if (inDropDown) {
            previousSize = this.size.inDropDown || this.toolbarAction.suggestSize || { width: 20, height: 30 };
            this.size.inDropDown = {
              width: element.offsetWidth,
              height: element.offsetHeight,
            };
          } else {
            previousSize = this.size.visible || this.toolbarAction.suggestSize || { width: 20, height: 30 };
            this.size.visible = {
              width: element.offsetWidth,
              height: element.offsetHeight,
            };
          }

          if (element.offsetWidth !== previousSize.width) {
            elementSizeDiffEmitter.fire(this.toolbarAction.id);
          }
        });
      }
    });
  }

  doRender(inDropDown, preferences?: IToolbarLocationPreference) {
    let canceled: boolean = false;
    this.renderPromise = {
      cancel: () => {
        canceled = true;
      },
      promise: new Promise<HTMLDivElement>((resolve, reject) => {
        const element = document.createElement('div');
        const C = this.toolbarAction.component;
        ReactDOM.render(<ConfigProvider value={this.context}>
          <C inDropDown={inDropDown} action={this.toolbarAction} preferences={preferences} />
        </ConfigProvider>, element, () => {
          if (canceled) {
            reject('canceled render toolbar');
          } else {
            resolve(element);
          }
        });
      }).then((resolved) => {
        this.renderPromise.resolved = resolved;
        return this.renderPromise.resolved;
      }),
      inDropDown,
    };
    return this.renderPromise.promise;
  }

}
