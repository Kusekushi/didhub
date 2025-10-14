import { useEffect, useMemo, useState } from 'react';
import uniq from 'lodash-es/uniq';
import {
  Container,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  CircularProgress,
  Stack,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  List,
  ListItem,
  ListItemText,
  Divider,
  Link as MuiLink,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { ApiAlter, ApiSystemDetail } from '../../types/ui';
import { listAlters } from '../../services/alterService';
import { getSubsystemById } from '../../services/subsystemService';

import ThumbnailWithHover from '../../components/ui/ThumbnailWithHover';
import {
  addDays,
  addMonths,
  BirthdayLike,
  generateCalendarWeeks,
  getOccurrenceForYear,
  isSameDay,
  parseBirthdayToDate,
  startOfMonth,
  startOfWeek,
} from './utils';

interface BirthdayEntry extends BirthdayLike {
  alter: ApiAlter;
  owner: ApiSystemDetail | null;
  label: string;
}

type CalendarView = 'month' | 'agenda';

export default function Birthdays() {
  const [entries, setEntries] = useState<BirthdayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [selected, setSelected] = useState<{ entry: BirthdayEntry; date: Date } | null>(null);
  const [view, setView] = useState<CalendarView>('month');
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res: any = (await listAlters({ limit: 1000 })) ?? { items: [] };
        const list = (res.items || []) as ApiAlter[];
        const ownerIds = uniq(list.map((a) => a?.owner_user_id).filter(Boolean));
        const owners = new Map<string, any>();
        await Promise.all(
          ownerIds.map(async (id) => {
            try {
              const owner = await getSubsystemById(id as string);
              if (owner) owners.set(id as string, owner);
            } catch (e) {
              // ignore missing owners
            }
          }),
        );

        const year = new Date().getFullYear();
        const nextEntries: BirthdayEntry[] = [];
        for (const alter of list) {
          if (!alter || !alter.birthday) continue;
          const parsed = parseBirthdayToDate(alter.birthday, year);
          if (!parsed) continue;
          nextEntries.push({
            alter,
            owner: alter.owner_user_id ? (owners.get(String(alter.owner_user_id)) ?? null) : null,
            month: parsed.getMonth(),
            day: parsed.getDate(),
            label: alter.name || '(no name)',
          });
        }

        if (!mounted) return;
        setEntries(nextEntries);
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
  const today = new Date();

  const weekdayFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: 'short' }), []);
  const monthLabelFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }), []);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }), []);

  const calendarWeeks = useMemo(() => generateCalendarWeeks(currentMonth), [currentMonth]);

  const weekdayLabels = useMemo(() => {
    const start = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(addDays(start, index)));
  }, [weekdayFormatter]);

  const entriesByMonthDay = useMemo(() => {
    const map = new Map<string, BirthdayEntry[]>();
    entries.forEach((entry) => {
      const key = `${entry.month}-${entry.day}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    });
    map.forEach((list) => list.sort((a, b) => a.label.localeCompare(b.label)));
    return map;
  }, [entries]);

  const agendaItems = useMemo(() => {
    const year = currentMonth.getFullYear();
    return entries
      .map((entry) => ({ entry, date: getOccurrenceForYear(entry, year) }))
      .filter(({ date }) => date.getMonth() === currentMonth.getMonth())
      .sort((a, b) => a.date.getDate() - b.date.getDate());
  }, [entries, currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, -1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  const handleToday = () => {
    setCurrentMonth(startOfMonth(new Date()));
  };

  if (loading)
    return (
      <Container sx={{ mt: 4 }}>
        <CircularProgress />
      </Container>
    );
  if (error) return <Container sx={{ mt: 4, color: 'red' }}>Error: {String(error)}</Container>;

  const renderMonthView = () => (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, mb: 1 }}>
        {weekdayLabels.map((label) => (
          <Typography key={label} variant="subtitle2" sx={{ textAlign: 'center', color: 'text.secondary' }}>
            {label}
          </Typography>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {calendarWeeks.flat().map((date) => {
          const key = date.toISOString();
          const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
          const isTodayCell = isSameDay(date, today);
          const dayEntries = entriesByMonthDay.get(`${date.getMonth()}-${date.getDate()}`) ?? [];

          return (
            <Box
              key={key}
              sx={{
                border: '1px solid',
                borderColor: isTodayCell ? theme.palette.primary.main : 'divider',
                borderRadius: 1,
                minHeight: { xs: 120, md: 140 },
                p: 1,
                backgroundColor: isCurrentMonth ? 'background.paper' : theme.palette.action.hover,
                opacity: isCurrentMonth ? 1 : 0.65,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
              }}
            >
              <Typography variant="subtitle2" sx={{ textAlign: 'right', fontWeight: isTodayCell ? 700 : 500 }}>
                {date.getDate()}
              </Typography>
              <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                {dayEntries.map((entry) => (
                  <Button
                    key={`${entry.alter.id}-${entry.day}-${entry.month}`}
                    onClick={() => setSelected({ entry, date })}
                    size="small"
                    variant="text"
                    sx={{
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      px: 1,
                      py: 0.5,
                      fontSize: '0.8rem',
                      borderRadius: 1,
                      backgroundColor:
                        theme.palette.mode === 'dark' ? 'rgba(144,202,249,0.16)' : 'rgba(25,118,210,0.08)',
                      color: 'primary.main',
                      '&:hover': {
                        backgroundColor:
                          theme.palette.mode === 'dark' ? 'rgba(144,202,249,0.24)' : 'rgba(25,118,210,0.16)',
                      },
                    }}
                  >
                    {entry.label}
                  </Button>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  const renderAgendaView = () => (
    <Box>
      {agendaItems.length === 0 ? (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          No birthdays recorded for this month yet.
        </Typography>
      ) : (
        <List>
          {agendaItems.map(({ entry, date }, idx) => (
            <Box key={`${entry.alter.id}-${date.getTime()}`}>
              <ListItem disableGutters alignItems="flex-start">
                <ListItemText
                  primary={
                    <MuiLink component={RouterLink} to={`/detail/alter/${entry.alter.id}`} underline="hover">
                      {entry.label}
                    </MuiLink>
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary">
                      {dateFormatter.format(date)}
                    </Typography>
                  }
                  sx={{ cursor: 'pointer' }}
                  onClick={() => setSelected({ entry, date })}
                />
              </ListItem>
              {idx < agendaItems.length - 1 && <Divider component="li" sx={{ my: 1 }} />}
            </Box>
          ))}
        </List>
      )}
    </Box>
  );

  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Birthdays
      </Typography>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 3 }}
      >
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={handlePrevMonth}>
            Previous
          </Button>
          <Button variant="outlined" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outlined" onClick={handleNextMonth}>
            Next
          </Button>
        </Stack>
        <Typography variant="h6">{monthLabelFormatter.format(currentMonth)}</Typography>
        <ToggleButtonGroup
          color="primary"
          value={view}
          exclusive
          onChange={(_, next: CalendarView | null) => next && setView(next)}
          size="small"
        >
          <ToggleButton value="month">Month</ToggleButton>
          <ToggleButton value="agenda">Agenda</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {view === 'month' ? renderMonthView() : renderAgendaView()}
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        aria-labelledby="birthday-dialog-title"
        aria-describedby="birthday-dialog-desc"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="birthday-dialog-title">
          {selected ? (
            <MuiLink component={RouterLink} to={`/detail/alter/${selected.entry.alter.id}`} underline="hover">
              {selected.entry.label}
            </MuiLink>
          ) : null}
        </DialogTitle>
        <DialogContent id="birthday-dialog-desc">
          {selected ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
              {Array.isArray(selected.entry.alter.images) && selected.entry.alter.images.length ? (
                <ThumbnailWithHover
                  image={selected.entry.alter.images[0] as string}
                  alt={selected.entry.alter.name || ''}
                  onClick={() => {
                    setSelected(null);
                    navigate(`/detail/alter/${selected.entry.alter.id}`);
                  }}
                  loading="lazy"
                />
              ) : null}
              <Stack spacing={1} sx={{ flex: 1 }}>
                <Typography variant="body1">
                  <MuiLink component={RouterLink} to={`/detail/alter/${selected.entry.alter.id}`} underline="hover">
                    {selected.entry.label}
                  </MuiLink>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Birthday: {dateFormatter.format(selected.date)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  System:{' '}
                  {selected.entry.owner ? (
                    <MuiLink component={RouterLink} to={`/did-system/${selected.entry.owner.user_id}`} underline="hover">
                      {selected.entry.owner.username || `#${selected.entry.owner.user_id}`}
                    </MuiLink>
                  ) : selected.entry.alter.owner_user_id ? (
                    <MuiLink
                      component={RouterLink}
                      to={`/did-system/${selected.entry.alter.owner_user_id}`}
                      underline="hover"
                    >
                      #{selected.entry.alter.owner_user_id}
                    </MuiLink>
                  ) : (
                    '—'
                  )}
                </Typography>
                {selected.entry.alter.description ? (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {selected.entry.alter.description}
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
