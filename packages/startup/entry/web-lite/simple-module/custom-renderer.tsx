import React = require('react');
import { ComponentRegistryInfo, useInjectable } from '@ali/ide-core-browser';
import { TabRendererBase, TabbarConfig } from '@ali/ide-main-layout/lib/browser/tabbar/renderer.view';
import { TabbarViewBase, IconElipses } from '@ali/ide-main-layout/lib/browser/tabbar/bar.view';
import { RightTabPanelRenderer } from '@ali/ide-main-layout/lib/browser/tabbar/panel.view';
import { TabbarService, TabbarServiceFactory } from '@ali/ide-main-layout/lib/browser/tabbar/tabbar.service';
import cls from 'classnames';
import './styles.less';

export const RightTabRenderer = ({className, components}: {className?: string, components: ComponentRegistryInfo[]}) => (
  <TabRendererBase side='right' direction='right-to-left' className={cls('right-slot', className)} components={components} TabbarView={RightTabbarRenderer} TabpanelView={RightTabPanelRenderer} />
);

export const RightTabbarRenderer: React.FC = () => {
  const { side } = React.useContext(TabbarConfig);
  const tabbarService: TabbarService = useInjectable(TabbarServiceFactory)(side);
  return (<div className='right_tab_bar' onContextMenu={tabbarService.handleContextMenu}>
    <TabbarViewBase
      tabSize={44}
      MoreTabView={IconElipses}
      tabClassName='kt_right_tab'
      TabView={TextTabView}
      barSize={30}
      panelBorderSize={1}/>
  </div>);
};

const TextTabView: React.FC<{
  component: ComponentRegistryInfo;
}> = ({component}) => {
  return <div className='dw-rotate'>{component.options?.title}</div>;
};