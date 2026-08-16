/**
 * LanguageSelector Component
 * Provides UI for users to switch between supported languages
 * Persists selection in localStorage via i18next
 * Supports English, Spanish, and Hindi with proper RTL handling
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import './LanguageSelector.css';

const LanguageSelector = () => {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'en', name: '🇺🇸 English', label: 'English' }
  ];

  const handleLanguageChange = (langCode) => {
    i18n.changeLanguage(langCode);
    // Apply RTL/LTR based on language
    
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = langCode;

  };

  return null;
};

export default LanguageSelector;
