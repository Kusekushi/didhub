import { useEffect, useState } from 'react';
import { Container, Typography, Dialog, DialogTitle, DialogContent, Box, CircularProgress } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useTheme } from '@mui/material/styles';

import { fetchAlters, getUser } from '@didhub/api-client';

const localizer = momentLocalizer(moment as any);

function parseBirthdayToDate(bday: any, year: number) {
  if (!bday) return null;
  const s = String(bday).trim();
  const formats = ['DD-MM', 'D-M', 'DD/MM', 'D/M', 'D MMMM', 'D MMM'];
  for (const fmt of formats) {
    const m = moment(s, fmt, true);
    if (m.isValid()) return new Date(year, m.month(), m.date());
  }
  const loose = moment(s);
  if (loose.isValid()) return new Date(year, loose.month(), loose.date());
  const nums = s.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  let month: any = null;
  let day: any = null;
  if (nums.length >= 3) {
    const [n1, n2, n3] = nums.map(Number);
    if (n1 > 31) {
      month = n2;
      day = n3;
    } else if (n3 > 31) {
      month = n2;
      day = n1;
    } else {
      month = n1;
      day = n2;
    }
  } else if (nums.length === 2) {
    const [n1, n2] = nums.map(Number);
    month = n1;
    day = n2;
  }
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

export default function Birthdays() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchAlters();
        const list = (res && res.items) || [];
        const curYear = new Date().getFullYear();
        const evts: any[] = [];
        const ownerIds = Array.from(new Set(list.map((a: any) => a.owner_user_id).filter(Boolean)));
        const usersMap: any = {};
        await Promise.all(
          ownerIds.map(async (id: any) => {
            try {
              const u = await getUser(id);
              if (u) usersMap[id] = u;
            } catch (e) {}
          }),
        );
        for (const a of list) {
          if (!a || !a.birthday) continue;
          for (const y of [curYear - 1, curYear, curYear + 1]) {
            const start = parseBirthdayToDate(a.birthday, y);
            if (!start) continue;
            evts.push({
              title: a.name || '(no name)',
              start,
              end: start,
              allDay: true,
              alter: a,
              owner: a.owner_user_id ? usersMap[a.owner_user_id] : null,
            });
          }
        }
        if (!mounted) return;
        setEvents(evts);
      } catch (e) {
        if (!mounted) return;
        setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const theme = useTheme();
  useEffect(() => {
    const id = 'rbc-theme-overrides';
    let styleEl = document.getElementById(id) as HTMLStyleElement;
    const bg = theme.palette.background.paper;
    const bodyBg = theme.palette.background.default;
    const text = theme.palette.text.primary;
    const muted = theme.palette.text.secondary;
    const today = theme.palette.action.selected || theme.palette.divider;
    const eventText = theme.palette.getContrastText(theme.palette.primary.main);
    const css = `
      :root {
        --rbc-bg: ${bg};
        --rbc-body-bg: ${bodyBg};
        --rbc-text: ${text};
        --rbc-text-muted: ${muted};
        --rbc-text-disabled: ${theme.palette.text.disabled};
        --rbc-today: ${today};
        --rbc-event-text: ${eventText};
        --rbc-divider: ${theme.palette.divider};
      }
      .rbc-calendar { background: var(--rbc-bg); color: var(--rbc-text); }
      .rbc-toolbar { background: transparent; color: var(--rbc-text); }
      .rbc-toolbar .rbc-toolbar-label { color: var(--rbc-text); }
      .rbc-toolbar button { color: var(--rbc-text); background: transparent; border: 1px solid var(--rbc-divider); pointer-events: auto; z-index: 5; }
      .rbc-toolbar .rbc-btn-group>button { cursor: pointer; }
      .rbc-toolbar .rbc-btn-group .rbc-btn { color: var(--rbc-text); border-color: transparent; }
      .rbc-toolbar button.rbc-active { box-shadow: none; }
      .rbc-month-view .rbc-row .rbc-header { color: var(--rbc-text-muted); }
      .rbc-day-bg { background: var(--rbc-body-bg); }
      .rbc-off-range { color: var(--rbc-text-disabled); }
      .rbc-today { background: var(--rbc-today) !important; }
      .rbc-event, .rbc-event-label { color: var(--rbc-event-text) !important; box-shadow: none; }
      .rbc-month-view .rbc-row, .rbc-month-view .rbc-row .rbc-date-cell { border-color: rgba(0,0,0,0.12); }
    `;

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = id;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
    return () => {
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    };
  }, [
    theme.palette.mode,
    theme.palette.background.paper,
    theme.palette.background.default,
    theme.palette.text.primary,
    theme.palette.text.secondary,
    theme.palette.action.selected,
    theme.palette.primary.main,
    theme.palette.text.disabled,
  ]);

  const onSelectEvent = (evt: any) => setSelected(evt);
  const eventStyleGetter = (event: any) => {
    const bg = theme.palette.mode === 'dark' ? theme.palette.primary.dark : theme.palette.primary.light;
    const color = theme.palette.getContrastText(bg);
    return { style: { backgroundColor: bg, color, borderRadius: 4, padding: '2px 4px', border: 'none' } };
  };

  if (loading)
    return (
      <Container sx={{ mt: 4 }}>
        <CircularProgress />
      </Container>
    );
  if (error) return <Container sx={{ mt: 4, color: 'red' }}>Error: {String(error)}</Container>;

  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Birthdays
      </Typography>
      <Box sx={{ height: '70vh' }}>
        <Calendar
          localizer={localizer as any}
          events={events}
          startAccessor="start"
          endAccessor="end"
          onSelectEvent={onSelectEvent}
          eventPropGetter={eventStyleGetter}
          views={{ month: true, agenda: true }}
          defaultView="month"
          popup={true}
          max={new Date(2099, 11)}
          showMultiDayTimes
          step={60}
        />
      </Box>
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        aria-labelledby="birthday-dialog-title"
        aria-describedby="birthday-dialog-desc"
      >
        <DialogTitle id="birthday-dialog-title">{selected ? selected.title : ''}</DialogTitle>
        <DialogContent id="birthday-dialog-desc">
          {selected ? (
            <div>
              <div>Birthday: {selected.start.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</div>
              <div>
                Alter: <a href={`/detail/${selected.alter.id}`}>{selected.alter.name}</a>
              </div>
              <div>
                System:{' '}
                {selected.owner ? (
                  <a href={`/did-system/${selected.owner.id}`}>{selected.owner.username}</a>
                ) : selected.alter.owner_user_id ? (
                  <a href={`/did-system/${selected.alter.owner_user_id}`}>#{selected.alter.owner_user_id}</a>
                ) : (
                  ''
                )}
              </div>
              <div style={{ marginTop: 8 }}>{selected.alter.description}</div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
