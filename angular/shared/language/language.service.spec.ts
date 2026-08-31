import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguagePipe } from './language.pipe';
import { provideLanguage } from './language.provider';
import { DEFAULT_LANGUAGE, LANGUAGES, LanguageService } from './language.service';

@Component({
  selector: 'app-probe',
  imports: [LanguagePipe],
  template: "{{ 'common.cancel' | t }}",
})
class Probe {}

describe('LanguageService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('exposes the supported languages', () => {
    expect(LANGUAGES).toEqual(['vi', 'en']);
    expect(DEFAULT_LANGUAGE).toBe('vi');
  });

  it('switches language, locale and document language', () => {
    const language = TestBed.inject(LanguageService);
    expect(language.locale()).toBe('vi-VN');
    language.setLanguage('en');
    expect(language.language()).toBe('en');
    expect(language.locale()).toBe('en-US');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('dreamy-studio.language')).toBe('en');
  });

  it('translates keys, interpolates params and falls back to the key', () => {
    const language = TestBed.inject(LanguageService);
    language.setLanguage('en');
    expect(language.translate('common.cancel')).toBe('Cancel');
    expect(language.translate('pipeline.progress', { done: 1, total: 2 })).toContain('1');
    expect(language.translate('not.a.key' as never)).toBe('not.a.key');
  });

  it('restores the stored language on init', () => {
    localStorage.setItem('dreamy-studio.language', 'en');
    const language = TestBed.inject(LanguageService);
    language.init();
    expect(language.language()).toBe('en');
  });

  it('detects the browser language when nothing is stored', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    const language = TestBed.inject(LanguageService);
    language.init();
    expect(language.language()).toBe('en');
  });

  it('ignores invalid stored values and unavailable storage', () => {
    localStorage.setItem('dreamy-studio.language', 'xx');
    const language = TestBed.inject(LanguageService);
    language.init();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    language.init();
    language.setLanguage('vi');
    expect(language.language()).toBe('vi');
  });

  it('initialises through the provider and renders through the pipe', () => {
    localStorage.setItem('dreamy-studio.language', 'en');
    TestBed.configureTestingModule({ providers: [provideLanguage()] });
    const fixture = TestBed.createComponent(Probe);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cancel');
  });
});
