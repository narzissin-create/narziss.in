import React, { useState, useEffect } from 'react';
import ProductForm from '../components/ProductForm';
import BannerForm from '../components/BannerForm';
import ThemeForm from '../components/ThemeForm';
import SectionForm from '../components/SectionForm';

const tabs = [
  { name: 'Products', component: ProductForm },
  { name: 'Banners', component: BannerForm },
  { name: 'Theme', component: ThemeForm },
  { name: 'Sections', component: SectionForm },
];

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState(tabs[0].name);
  const ActiveComponent = tabs.find(t => t.name === activeTab).component;

  return (
    <div className="admin-panel" style={styles.container}>
      <h1 style={styles.title}>Admin Panel</h1>
      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            style={tab.name === activeTab ? styles.activeTab : styles.tab}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <div style={styles.content}>
        <ActiveComponent />
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    fontFamily: `'Inter', sans-serif`,
    background: 'linear-gradient(135deg, #f0f4ff, #e6e9ff)',
    minHeight: '100vh',
  },
  title: {
    textAlign: 'center',
    marginBottom: '1.5rem',
    color: '#333',
  },
  tabBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  tab: {
    padding: '0.6rem 1.2rem',
    border: 'none',
    borderRadius: '8px',
    background: '#d9d9ff',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  activeTab: {
    padding: '0.6rem 1.2rem',
    border: 'none',
    borderRadius: '8px',
    background: '#7367f0',
    color: '#fff',
    cursor: 'pointer',
  },
  content: {
    marginTop: '1rem',
  },
};

export default AdminPanel;
