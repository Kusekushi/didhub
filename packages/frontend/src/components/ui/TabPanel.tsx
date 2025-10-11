import React from 'react';

export interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
  labelledBy?: string;
}

export default function TabPanel(props: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={props.value !== props.index}
      id={`admin-tabpanel-${props.index}`}
      aria-labelledby={props.labelledBy || `admin-tab-${props.index}`}
    >
      {props.value === props.index ? <div style={{ paddingTop: 8 }}>{props.children}</div> : null}
    </div>
  );
}
