/**
 * Component tests for the three shared primitives the mobile-parity pass
 * introduced. These run under the `jest-expo` preset (see jest.config.js) so
 * React Native and the Expo modules are mocked.
 *
 * The icon set is mocked to render a host element tagged
 * `icon-<Set>-<glyph>`, which lets a test assert WHICH glyph was chosen —
 * the thing that actually regressed repeatedly during the port.
 */
const React = require('react');
const { render, fireEvent } = require('@testing-library/react-native');

const { Icon } = require('@/components/Icon');
const { Stars, StarPicker } = require('@/components/Stars');

describe('<Icon>', () => {
  it('maps a lucide name onto the expected icon-set glyph', () => {
    const { getByTestId } = render(<Icon name="shopping-cart" />);
    expect(getByTestId('icon-Feather-shopping-cart')).toBeTruthy();
  });

  it('routes solid variants to Ionicons, which Feather has no equivalent for', () => {
    expect(render(<Icon name="star-filled" />).getByTestId('icon-Ionicons-star')).toBeTruthy();
    expect(render(<Icon name="heart-filled" />).getByTestId('icon-Ionicons-heart')).toBeTruthy();
    expect(render(<Icon name="heart" />).getByTestId('icon-Ionicons-heart-outline')).toBeTruthy();
  });

  it('remaps names whose Feather glyph differs from the lucide one', () => {
    // lucide `sliders-horizontal` is Feather `sliders`; `store` is
    // `shopping-bag`; `pencil` is `edit-2`; `check-circle-2` is `check-circle`.
    expect(render(<Icon name="sliders-horizontal" />).getByTestId('icon-Feather-sliders')).toBeTruthy();
    expect(render(<Icon name="store" />).getByTestId('icon-Feather-shopping-bag')).toBeTruthy();
    expect(render(<Icon name="pencil" />).getByTestId('icon-Feather-edit-2')).toBeTruthy();
    expect(render(<Icon name="check-circle-2" />).getByTestId('icon-Feather-check-circle')).toBeTruthy();
  });

  it('routes banknote to MaterialCommunityIcons', () => {
    expect(render(<Icon name="banknote" />).getByTestId('icon-MaterialCommunityIcons-cash-multiple')).toBeTruthy();
  });

  it('warns and renders nothing for an unknown name instead of crashing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { toJSON } = render(<Icon name="definitely-not-an-icon" />);
    expect(toJSON()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('definitely-not-an-icon'));
    warn.mockRestore();
  });

  it('forwards size and colour to the glyph', () => {
    const { getByTestId } = render(<Icon name="x" size={33} color="#ff0000" />);
    const el = getByTestId('icon-Feather-x');
    expect(el.props.size).toBe(33);
    expect(el.props.color).toBe('#ff0000');
  });
});

describe('<Stars>', () => {
  const starsIn = (tree) => tree.root.findAll((n) => n.props?.testID === 'icon-Ionicons-star');

  it('always renders exactly five stars', () => {
    for (const rating of [0, 1, 2.5, 5]) {
      const { UNSAFE_root } = render(<Stars rating={rating} />);
      expect(starsIn({ root: UNSAFE_root })).toHaveLength(5);
    }
  });

  it('rounds a fractional rating by default', () => {
    // 3.5 -> 4 filled. Fill is expressed by colour, so compare the two colours.
    const { UNSAFE_root } = render(<Stars rating={3.5} />);
    const stars = starsIn({ root: UNSAFE_root });
    const colours = stars.map((s) => s.props.color);
    const filledColour = colours[0];
    expect(colours.filter((c) => c === filledColour)).toHaveLength(4);
  });

  it('does not round when round={false}', () => {
    const { UNSAFE_root } = render(<Stars rating={3.9} round={false} />);
    const colours = starsIn({ root: UNSAFE_root }).map((s) => s.props.color);
    expect(colours.filter((c) => c === colours[0])).toHaveLength(3);
  });

  it('treats a missing or junk rating as zero filled', () => {
    const { UNSAFE_root } = render(<Stars rating={undefined} />);
    const colours = starsIn({ root: UNSAFE_root }).map((s) => s.props.color);
    // All five share the unfilled colour.
    expect(new Set(colours).size).toBe(1);
  });

  it('honours the size prop', () => {
    const { UNSAFE_root } = render(<Stars rating={5} size={10} />);
    starsIn({ root: UNSAFE_root }).forEach((s) => expect(s.props.size).toBe(10));
  });
});

describe('<StarPicker>', () => {
  it('renders five tappable stars and reports the tapped value', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<StarPicker value={0} onChange={onChange} />);
    fireEvent.press(getByLabelText('Rate 4 stars'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('labels a single star in the singular', () => {
    const { getByLabelText } = render(<StarPicker value={0} onChange={() => {}} />);
    expect(getByLabelText('Rate 1 star')).toBeTruthy();
  });

  it('shows outline stars above the current value and solid at or below it', () => {
    const { UNSAFE_root } = render(<StarPicker value={2} onChange={() => {}} />);
    const solid = UNSAFE_root.findAll((n) => n.props?.testID === 'icon-Ionicons-star');
    const outline = UNSAFE_root.findAll((n) => n.props?.testID === 'icon-Ionicons-star-outline');
    expect(solid).toHaveLength(2);
    expect(outline).toHaveLength(3);
  });
});