import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminPaths, canManagePage, useAdminAuth, useStudioData } from '@/application';
import { matchesArabicSearch, type EpisodeStatus, type GuestId, type ShowId } from '@/lib';
import { GuestAppearancesSection, type GuestAppearanceSortMode } from './guest-appearances-section';
import { GuestContactCard } from './guest-contact-card';
import { GuestIdentitySection } from './guest-identity-section';

export function GuestProfileView() {
  const { data } = useStudioData();
  if (!data.guestDirectory) {
    return (
      <section className="card form-card" role="status" aria-labelledby="guest-unavailable-title">
        <h1 id="guest-unavailable-title">ملفات الضيوف غير متاحة</h1>
        <p className="empty-state">إدارة الضيوف غير مفعّلة في مصدر البيانات الحالي.</p>
        <Link to={adminPaths.overview} className="back-link">
          → عودة إلى نظرة عامة
        </Link>
      </section>
    );
  }

  return <AvailableGuestProfileView />;
}

function AvailableGuestProfileView() {
  const { viewer } = useAdminAuth();
  const { guestId } = useParams<{ guestId: GuestId }>();
  const {
    data,
    updateGuest,
    addGuestSocial,
    updateGuestSocial,
    removeGuestSocial,
    addGuestAppearance,
    removeGuestAppearance,
  } = useStudioData();
  const canManageGuests = viewer ? canManagePage(viewer, 'guests') : false;
  const canManageEpisodes = viewer ? canManagePage(viewer, 'episodes') : false;
  const guestDirectory = data.guestDirectory;
  if (!guestDirectory) {
    throw new Error('Guest profile mounted without guest-management data.');
  }
  const guest = guestDirectory.guests.find((item) => item.id === guestId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerShow, setPickerShow] = useState<'all' | ShowId>('all');
  const [appearanceQuery, setAppearanceQuery] = useState('');
  const [appearanceShow, setAppearanceShow] = useState<'all' | ShowId>('all');
  const [appearanceStatus, setAppearanceStatus] = useState<'all' | EpisodeStatus>('all');
  const [sort, setSort] = useState<GuestAppearanceSortMode>('newest');
  const [expanded, setExpanded] = useState(false);

  const linkedIds = useMemo(
    () =>
      new Set(
        guestDirectory.guestAppearances
          .filter((appearance) => appearance.guestId === guestId)
          .map((appearance) => appearance.episodeId),
      ),
    [guestDirectory.guestAppearances, guestId],
  );

  const appearances = useMemo(
    () => data.episodes.filter((episode) => linkedIds.has(episode.id)),
    [data.episodes, linkedIds],
  );

  const pickerResults = useMemo(
    () =>
      data.episodes.filter((episode) => {
        const show = data.shows.find((item) => item.id === episode.showId);
        return (
          !linkedIds.has(episode.id) &&
          (pickerShow === 'all' || episode.showId === pickerShow) &&
          matchesArabicSearch(pickerQuery, episode.title, episode.episodeNumber, show?.name)
        );
      }),
    [data.episodes, data.shows, linkedIds, pickerQuery, pickerShow],
  );

  const filteredAppearances = useMemo(() => {
    const result = appearances.filter((episode) => {
      const show = data.shows.find((item) => item.id === episode.showId);
      return (
        (appearanceShow === 'all' || episode.showId === appearanceShow) &&
        (appearanceStatus === 'all' || episode.status === appearanceStatus) &&
        matchesArabicSearch(appearanceQuery, episode.title, episode.episodeNumber, show?.name)
      );
    });
    return result.sort((a, b) => {
      if (sort === 'show') {
        const aShow = data.shows.find((item) => item.id === a.showId)?.name ?? '';
        const bShow = data.shows.find((item) => item.id === b.showId)?.name ?? '';
        return aShow.localeCompare(bShow, 'ar');
      }
      const difference = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return sort === 'newest' ? difference : -difference;
    });
  }, [appearanceQuery, appearanceShow, appearanceStatus, appearances, data.shows, sort]);

  if (!guest) {
    return (
      <section className="card form-card">
        <h1>الضيف غير موجود</h1>
        <p className="empty-state">لم نجد ملف الضيف المطلوب.</p>
        <Link to={adminPaths.guests} className="back-link">
          → عودة إلى الضيوف
        </Link>
      </section>
    );
  }

  const socials = guestDirectory.guestSocials.filter((social) => social.guestId === guest.id);
  const hasAppearanceFilters =
    appearanceQuery !== '' || appearanceShow !== 'all' || appearanceStatus !== 'all';
  const visibleAppearances = expanded ? filteredAppearances : filteredAppearances.slice(0, 4);
  const remaining = Math.max(0, filteredAppearances.length - 4);

  function resetAppearanceExpansion() {
    setExpanded(false);
  }

  return (
    <>
      <div className="back-row">
        <Link to={adminPaths.guests} className="back-link">
          → عودة إلى الضيوف
        </Link>
      </div>

      <div className="profile-grid">
        <section className="card profile-card" aria-label={`ملف ${guest.name || 'الضيف'}`}>
          <GuestIdentitySection
            key={guest.id}
            guest={guest}
            readOnly={!canManageGuests}
            onUpdate={(patch) => updateGuest(guest.id, patch)}
          />

          <GuestAppearancesSection
            appearances={appearances}
            visibleAppearances={visibleAppearances}
            filteredAppearanceCount={filteredAppearances.length}
            hasFilters={hasAppearanceFilters}
            remainingCount={remaining}
            expanded={expanded}
            pickerOpen={pickerOpen}
            pickerQuery={pickerQuery}
            pickerShow={pickerShow}
            pickerResults={pickerResults}
            appearanceQuery={appearanceQuery}
            appearanceShow={appearanceShow}
            appearanceStatus={appearanceStatus}
            sort={sort}
            shows={data.shows}
            readOnly={!canManageGuests}
            canOpenEpisodeEditor={canManageEpisodes}
            onPickerToggle={() => setPickerOpen((value) => !value)}
            onPickerQueryChange={setPickerQuery}
            onPickerShowChange={setPickerShow}
            onAppearanceAdd={(episodeId) => addGuestAppearance(guest.id, episodeId)}
            onAppearanceRemove={(episodeId) => removeGuestAppearance(guest.id, episodeId)}
            onAppearanceQueryChange={(query) => {
              setAppearanceQuery(query);
              resetAppearanceExpansion();
            }}
            onAppearanceShowChange={(showId) => {
              setAppearanceShow(showId);
              resetAppearanceExpansion();
            }}
            onAppearanceStatusChange={(status) => {
              setAppearanceStatus(status);
              resetAppearanceExpansion();
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              resetAppearanceExpansion();
            }}
            onExpandedToggle={() => setExpanded((value) => !value)}
          />
        </section>

        <GuestContactCard
          key={guest.id}
          guest={guest}
          socials={socials}
          appearanceCount={appearances.length}
          readOnly={!canManageGuests}
          onGuestUpdate={(patch) => updateGuest(guest.id, patch)}
          onSocialAdd={async () => {
            await addGuestSocial(guest.id);
          }}
          onSocialUpdate={updateGuestSocial}
          onSocialRemove={removeGuestSocial}
        />
      </div>
    </>
  );
}
