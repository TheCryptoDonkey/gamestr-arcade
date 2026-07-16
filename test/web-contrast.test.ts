// @vitest-environment happy-dom

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

const read = (path: string) => readFile(path, 'utf8')

function channels(color: string): [number, number, number] {
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return [color[1], color[2], color[3]].map(value => Number.parseInt(value + value, 16)) as [number, number, number]
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map(value => Number.parseInt(value, 16)) as [number, number, number]
  }
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`Unsupported computed colour: ${color}`)
}

function luminance(color: string): number {
  const values = channels(color).map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function contrast(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background))
  const dark = Math.min(luminance(foreground), luminance(background))
  return (light + 0.05) / (dark + 0.05)
}

function expectReadable(foregroundSelector: string, backgroundSelector: string): void {
  const foreground = document.querySelector<HTMLElement>(foregroundSelector)
  const background = document.querySelector<HTMLElement>(backgroundSelector)
  expect(foreground, foregroundSelector).not.toBeNull()
  expect(background, backgroundSelector).not.toBeNull()
  const foregroundColor = getComputedStyle(foreground!).color
  const backgroundColor = getComputedStyle(background!).backgroundColor
  expect(contrast(foregroundColor, backgroundColor), `${foregroundSelector} (${foregroundColor}) on ${backgroundSelector} (${backgroundColor})`).toBeGreaterThanOrEqual(4.5)
}

describe('600 Billion web edition contrast', () => {
  let stylesheet = ''

  beforeAll(async () => { stylesheet = await read('src/web/style.css') })

  beforeEach(() => {
    document.documentElement.dataset.webEdition = '600'
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    const style = document.createElement('style')
    style.textContent = stylesheet
    document.head.append(style)
    document.body.innerHTML = `
      <header class="site-header">
        <span class="brand-name" id="brand-name">600 000 000 000</span>
        <nav class="site-nav"><a class="active" id="active-nav">Build</a></nav>
      </header>
      <section class="hero" id="hero">
        <p class="kicker" id="hero-kicker">600 PRESENTS</p>
        <h1 id="hero-title">Three games</h1>
        <p class="hero-lede" id="hero-lede">One enormous number.</p>
      </section>
      <section class="discovery-controls">
        <div class="filter-tabs"><button class="selected" id="selected-filter">All</button></div>
      </section>
      <div class="section-heading"><h2 id="floor-title">Arcade floor</h2></div>
      <article class="game-card" id="game-card">
        <button class="game-art" id="game-art"><span class="wordmark" id="wordmark">Pallasite</span></button>
        <div class="game-body"><h3 id="game-title">Pallasite</h3><p id="game-copy">Mine a neon asteroid belt.</p></div>
      </article>
      <section class="activity-list"><li id="activity-row"><span class="mini-avatar" id="mini-avatar" style="background:#4f46e5">AB</span><a class="player" id="activity-player">Alice</a><b id="activity-score">4200</b><small id="activity-time">Now</small></li></section>
      <div class="activity-modes"><button class="selected" id="activity-selected">All</button></div>
      <main class="page prose" id="build-page">
        <h1 id="build-title">Bring your game</h1>
        <p class="page-lede" id="build-lede">Your URL, your code, your player relationship.</p>
        <div class="dev-steps"><section id="build-card"><h2 id="build-card-title">Declare the game</h2><p id="build-card-copy">Add a Manifest v2 file.</p></section></div>
        <h2 id="canonical-title">Canonical score event</h2>
        <section class="manifest-studio">
          <h2 id="studio-title">Validate locally</h2>
          <p class="studio-lede" id="studio-lede">The manifest is checked against the cabinet schema.</p>
          <div class="studio-editor" id="studio-editor"><label id="editor-label">Manifest v2 JSON</label><output class="studio-status" id="studio-status">Valid manifest.</output></div>
          <article class="studio-preview" id="studio-preview"><span class="preview-label" id="preview-label">Listing preview</span><h3 id="preview-title">My game</h3><p id="preview-copy">A one-line reason to play.</p><code id="preview-url">https://play.example/</code></article>
        </section>
      </main>
      <form class="challenge-form" id="challenge-form">
        <p class="kicker" id="challenge-kicker">Signed challenge</p>
        <h2 id="challenge-title">Challenge players</h2>
        <p id="challenge-lede">Signed scores become the live standings.</p>
        <label id="challenge-label">Challenge name</label>
        <button class="primary" id="challenge-create">Sign and create</button>
        <button class="secondary" id="challenge-cancel">Cancel</button>
      </form>
      <footer id="footer"><p id="footer-copy">Scores live on Nostr.</p></footer>
    `
  })

  it('keeps text readable on orange edition backgrounds', () => {
    for (const selector of ['#brand-name', '#hero-kicker', '#hero-title', '#hero-lede', '#floor-title', '#build-title', '#build-lede', '#canonical-title', '#studio-title', '#studio-lede', '#footer-copy']) {
      expectReadable(selector, 'html')
    }
    expectReadable('#active-nav', '#active-nav')
    expectReadable('#selected-filter', '#selected-filter')
    expectReadable('#activity-selected', '#activity-selected')
  })

  it('keeps text readable inside white cards and tools', () => {
    for (const selector of ['#game-title', '#game-copy']) expectReadable(selector, '#game-card')
    expectReadable('#wordmark', '#game-art')
    for (const selector of ['#activity-player', '#activity-score', '#activity-time']) expectReadable(selector, '#activity-row')
    expectReadable('#mini-avatar', '#mini-avatar')
    for (const selector of ['#build-card-title', '#build-card-copy']) expectReadable(selector, '#build-card')
    expectReadable('#editor-label', '#studio-editor')
    expectReadable('#studio-status', '#studio-status')
    for (const selector of ['#preview-label', '#preview-title', '#preview-copy', '#preview-url']) expectReadable(selector, '#studio-preview')
  })

  it('keeps every challenge-dialog label, action, and explanation readable', () => {
    for (const selector of ['#challenge-kicker', '#challenge-title', '#challenge-lede', '#challenge-label', '#challenge-cancel']) {
      expectReadable(selector, '#challenge-form')
    }
    expectReadable('#challenge-create', '#challenge-create')
  })
})
