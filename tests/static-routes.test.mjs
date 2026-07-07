import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {resolveStaticRequest} from '../src/static-routes.mjs'

test('static routes expose KANO source icons without escaping the source project', () => {
	const route = resolveStaticRequest('/kano-source/Resources/PixelHotkeysV4_BigCutePinkOrange/dark_mind.png', {
		publicDir: path.resolve('public'),
		resourceDir: path.resolve('..', '资源'),
		kanoSourceDir: 'F:/acr开发/KanoACR/Kano',
	})

	assert.equal(route.forbidden, false)
	assert.match(route.filePath, /KanoACR[\\/]Kano[\\/]Resources[\\/]PixelHotkeysV4_BigCutePinkOrange[\\/]dark_mind\.png$/)
})

test('static routes reject path traversal against KANO source files', () => {
	const route = resolveStaticRequest('/kano-source/../Kano.csproj', {
		publicDir: path.resolve('public'),
		resourceDir: path.resolve('..', '资源'),
		kanoSourceDir: 'F:/acr开发/KanoACR/Kano',
	})

	assert.equal(route.forbidden, true)
})
