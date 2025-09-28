import React from 'react';

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
  labelledBy?: string;
}

export default function TabPanel({ children, value, index, labelledBy }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={labelledBy || `admin-tab-${index}`}
    >
      {value === index ? <div style={{ paddingTop: 8 }}>{children}</div> : null}
    </div>
  );
}
