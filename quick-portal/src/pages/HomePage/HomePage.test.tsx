import { render, screen } from '@test-utils';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders a blank body', () => {
    render(
      <div data-testid="body">
        <HomePage />
      </div>
    );
    expect(screen.getByTestId('body')).toBeEmptyDOMElement();
  });
});
