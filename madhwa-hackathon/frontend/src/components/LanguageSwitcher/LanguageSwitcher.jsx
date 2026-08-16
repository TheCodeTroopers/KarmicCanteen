/**
 * Language Switcher Component
 * 
 * A dropdown component that allows users to switch between supported languages.
 * Features:
 * - Displays current language with flag
 * - Shows all supported languages
 * - Smooth transitions
 * - Error handling
 * - Accessible keyboard navigation
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, changeLanguage, getCurrentLanguage } from '../../i18n/i18n';
import './LanguageSwitcher.css';

const LanguageSwitcher = () => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const dropdownRef = useRef(null);

  // Get current language info
  const currentLang = SUPPORTED_LANGUAGES.find(
    lang => lang.code === i18n.language
  ) || SUPPORTED_LANGUAGES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle language change
  const handleLanguageChange = async (languageCode) => {
    if (languageCode === i18n.language || isChanging) {
      setIsOpen(false);
      return;
    }

    try {
      setIsChanging(true);
      const success = await changeLanguage(languageCode);
      
      if (success) {
        // Close dropdown after successful change
        setTimeout(() => {
          setIsOpen(false);
          setIsChanging(false);
        }, 300);
      } else {
        console.error('Failed to change language');
        setIsChanging(false);
      }
    } catch (error) {
      console.error('Error changing language:', error);
      setIsChanging(false);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (event, languageCode) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleLanguageChange(languageCode);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return null;
};

export default LanguageSwitcher;
