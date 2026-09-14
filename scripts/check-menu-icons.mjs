import { assert, checks, loadModule } from './native-services-fixture.mjs'

// Exercise each shipped JS entry at the native-component boundary. UIKit/SF
// Symbols rendering, especially on iOS 16.6, still requires device acceptance.
const { check, finish } = checks()
const packageRoot = 'node_modules/@react-native-menu/menu'
const { objectHash } = loadModule(`${packageRoot}/src/utils.ts`, {})
const jsx = (type, props) => ({ type, props })
const react = {
	forwardRef: (render) => render,
	useMemo: (calculate) => calculate(),
	createElement: (type, props, children) => jsx(type, { ...props, children }),
}

function processColor(color) {
	if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) {
		return (0xff000000 | Number.parseInt(color.slice(1), 16)) >>> 0
	}
	if (color === 'transparent') return 0
	return color
}

function fixture(entry, platform = 'ios') {
	let scheme = 'light'
	const { MenuView } = loadModule(
		`${packageRoot}/${entry}`,
		{
			react,
			'react/jsx-runtime': { jsx },
			'react-native': { Platform: { OS: platform }, processColor, useColorScheme: () => scheme },
			'./UIMenuView': 'NativeMenu',
			'./utils': { objectHash },
		},
		{ React: react },
	)
	return {
		render(props, nextScheme = scheme, ref = undefined) {
			scheme = nextScheme
			return MenuView(props, ref).props
		},
	}
}

for (const entry of ['src/index.tsx', 'lib/module/index.js', 'lib/commonjs/index.js']) {
	await check(`${entry}: normal and destructive icons have opaque theme colors`, () => {
		const test = fixture(entry)
		const actions = [
			{ id: 'like', title: 'Like', image: 'heart' },
			{ id: 'delete', title: 'Delete', image: 'trash', attributes: { destructive: true } },
		]
		const light = test.render({ actions }, 'light')
		const dark = test.render({ actions }, 'dark')
		assert.equal(light.actions[0].imageColor, 0xff000000)
		assert.equal(dark.actions[0].imageColor, 0xffffffff)
		assert.equal(light.actions[1].imageColor, 0xffff3b30)
		assert.equal(dark.actions[1].imageColor, 0xffff453a)
		assert.notEqual(light.actionsHash, dark.actionsHash, 'Fabric must receive a new action hash')
		assert.equal(light.actionsHash, objectHash(light.actions))
	})

	await check(`${entry}: explicit menu appearance takes precedence over device appearance`, () => {
		const test = fixture(entry)
		const actions = [{ title: 'Add', image: 'plus' }]
		assert.equal(
			test.render({ actions, themeVariant: 'dark' }, 'light').actions[0].imageColor,
			0xffffffff,
		)
		assert.equal(
			test.render({ actions, themeVariant: 'light' }, 'dark').actions[0].imageColor,
			0xff000000,
		)
		assert.equal(
			test.render({ actions, themeVariant: 'system' }, 'dark').actions[0].imageColor,
			0xffffffff,
		)
		assert.equal(test.render({ actions }, null).actions[0].imageColor, 0xff000000)
	})

	await check(`${entry}: submenu icons receive defaults without changing text-only actions`, () => {
		const action = Object.freeze({
			title: 'Artists',
			image: 'person',
			subactions: Object.freeze([
				Object.freeze({ title: 'Artist', image: 'person' }),
				Object.freeze({ title: '10 minutes' }),
			]),
		})
		const result = fixture(entry).render({ actions: Object.freeze([action]) }, 'dark')
		assert.equal(result.actions[0].imageColor, 0xffffffff)
		assert.equal(result.actions[0].subactions[0].imageColor, 0xffffffff)
		assert.equal(result.actions[0].subactions[1].imageColor, undefined)
		assert.equal(result.actions[0].subactions[1].image, undefined)
		assert.equal(action.imageColor, undefined, 'Do not mutate the caller action')
	})

	await check(`${entry}: caller colors, including explicit zero, are preserved`, () => {
		const test = fixture(entry)
		for (const imageColor of ['#123456', 0, 'transparent']) {
			const actions = [
				{ title: 'Delete', image: 'trash', imageColor, attributes: { destructive: true } },
			]
			assert.equal(test.render({ actions }, 'dark').actions[0].imageColor, processColor(imageColor))
		}
		assert.equal(
			test.render({ actions: [{ title: 'Add', image: 'plus', imageColor: null }] }, 'light')
				.actions[0].imageColor,
			0xff000000,
		)
	})

	await check(`${entry}: Android retains its existing default-color behavior`, () => {
		const test = fixture(entry, 'android')
		const actions = [{ title: 'Add', image: 'ic_menu_add' }]
		const light = test.render({ actions }, 'light')
		const dark = test.render({ actions }, 'dark')
		assert.equal(light.actions[0].imageColor, undefined)
		assert.equal(light.actionsHash, dark.actionsHash)
	})

	await check(`${entry}: identifiers, state, callbacks and component props are forwarded`, () => {
		const test = fixture(entry)
		const attributes = { disabled: true, keepsMenuPresented: true }
		const onPressAction = () => {}
		const onCloseMenu = () => {}
		const hitSlop = { top: 3, bottom: 4, left: 5, right: 6 }
		const ref = {}
		const result = test.render(
			{
				actions: [{ id: 'selected', title: 'Selected', image: 'heart', state: 'on', attributes }],
				onPressAction,
				onCloseMenu,
				hitSlop,
				shouldOpenOnLongPress: true,
			},
			'dark',
			ref,
		)
		assert.equal(result.actions[0].id, 'selected')
		assert.equal(result.actions[0].state, 'on')
		assert.equal(result.actions[0].attributes, attributes)
		assert.equal(result.onPressAction, onPressAction)
		assert.equal(result.onCloseMenu, onCloseMenu)
		assert.equal(result.hitSlop, hitSlop)
		assert.equal(result.shouldOpenOnLongPress, true)
		assert.equal(result.ref, ref)
	})
}

finish()
