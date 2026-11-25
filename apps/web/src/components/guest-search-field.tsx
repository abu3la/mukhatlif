import { BrandIcon } from './brand-icon';
import { GUEST_SEARCH_MAX_LENGTH } from './guest-utils';

/**
 * The guests' question on the night stage (D-24), in the search page's field:
 * the stage's raised surface, its wall for an edge and the action in the
 * stage's ink at the field's end. A plain GET form, so it works before
 * hydration and while the list is still loading.
 */
export function GuestSearchField({ search = '' }: { search?: string }) {
  return (
    <form className="search-field" action="/guests" role="search">
      <label htmlFor="guest-search-input">ابحث عن ضيف</label>
      <div className="search-field__box">
        <input
          key={search}
          id="guest-search-input"
          type="search"
          name="search"
          defaultValue={search}
          maxLength={GUEST_SEARCH_MAX_LENGTH}
          placeholder="الاسم، المجال أو المدينة"
          autoComplete="off"
        />
        <button type="submit" aria-label="بحث">
          <BrandIcon name="search" />
        </button>
      </div>
    </form>
  );
}
