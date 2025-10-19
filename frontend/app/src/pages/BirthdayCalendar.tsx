import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, Cake, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi } from '@/context/ApiContext'
import { useToast } from '@/context/ToastContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router-dom'

interface AlterBirthday {
  id: string
  name: string
  birthday: string | null
  userId: string
}

interface BirthdayByDate {
  [key: string]: AlterBirthday[]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function BirthdayCalendar() {
  const [birthdays, setBirthdays] = useState<AlterBirthday[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear] = useState(new Date().getFullYear())
  const apiClient = useApi()
  const { show: showToast } = useToast()

  useEffect(() => {
    loadBirthdays()
  }, [])

  const loadBirthdays = async () => {
    try {
      setLoading(true)
      const response = await apiClient.listAlterBirthdays()
      setBirthdays(response.data as AlterBirthday[])
    } catch (error) {
      showToast({ title: 'Failed to load birthdays', variant: 'error' })
      console.error('Error loading birthdays:', error)
    } finally {
      setLoading(false)
    }
  }

  const organizeBirthdaysByDate = (): BirthdayByDate => {
    const organized: BirthdayByDate = {}
    
    birthdays.forEach(birthday => {
      if (!birthday.birthday) return
      
      try {
        const date = new Date(birthday.birthday)
        const month = date.getMonth()
        const day = date.getDate()
        const key = `${month}-${day}`
        
        if (!organized[key]) {
          organized[key] = []
        }
        organized[key].push(birthday)
      } catch (error) {
        console.error('Error parsing birthday:', birthday.birthday, error)
      }
    })
    
    return organized
  }

  const getBirthdaysForDate = (month: number, day: number): AlterBirthday[] => {
    const key = `${month}-${day}`
    return organizeBirthdaysByDate()[key] || []
  }

  const getUpcomingBirthdays = (): AlterBirthday[] => {
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentDay = today.getDate()
    
    return birthdays
      .filter(b => b.birthday)
      .map(birthday => {
        const date = new Date(birthday.birthday!)
        const bMonth = date.getMonth()
        const bDay = date.getDate()
        
        let daysUntil = 0
        if (bMonth > currentMonth || (bMonth === currentMonth && bDay >= currentDay)) {
          const nextBirthday = new Date(currentYear, bMonth, bDay)
          const now = new Date(currentYear, currentMonth, currentDay)
          daysUntil = Math.floor((nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        } else {
          const nextBirthday = new Date(currentYear + 1, bMonth, bDay)
          const now = new Date(currentYear, currentMonth, currentDay)
          daysUntil = Math.floor((nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        }
        
        return { ...birthday, daysUntil }
      })
      .sort((a: any, b: any) => a.daysUntil - b.daysUntil)
      .slice(0, 5)
  }

  const getFirstDayOfMonth = (month: number): number => {
    return new Date(currentYear, month, 1).getDay()
  }

  const renderCalendar = () => {
    const firstDay = getFirstDayOfMonth(currentMonth)
    const daysInMonth = DAYS_IN_MONTH[currentMonth]
    const weeks: React.ReactElement[] = []
    let days: React.ReactElement[] = []

    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div key={`empty-${i}`} className="p-2 border border-border/50 bg-muted/20 min-h-[100px]">
          <div className="text-muted-foreground text-sm">&nbsp;</div>
        </div>
      )
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const birthdaysOnDay = getBirthdaysForDate(currentMonth, day)
      const isToday = currentMonth === new Date().getMonth() && day === new Date().getDate()
      
      days.push(
        <div
          key={day}
          className={`p-2 border border-border/50 min-h-[100px] ${
            isToday ? 'bg-primary/10 border-primary' : 'bg-card'
          } ${birthdaysOnDay.length > 0 ? 'hover:bg-accent/50 cursor-pointer' : ''}`}
        >
          <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : 'text-foreground'}`}>
            {day}
          </div>
          {birthdaysOnDay.length > 0 && (
            <div className="space-y-1">
              {birthdaysOnDay.map(birthday => (
                <Link
                  key={birthday.id}
                  to={`/alter/${birthday.id}`}
                  className="block text-xs p-1 rounded bg-primary/20 hover:bg-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <Cake className="w-3 h-3" />
                    <span className="truncate">{birthday.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )

      // Start a new week after Saturday
      if ((firstDay + day) % 7 === 0 || day === daysInMonth) {
        weeks.push(
          <div key={`week-${weeks.length}`} className="grid grid-cols-7 gap-0">
            {days}
          </div>
        )
        days = []
      }
    }

    return weeks
  }

  const nextMonth = () => {
    setCurrentMonth((prev) => (prev + 1) % 12)
  }

  const prevMonth = () => {
    setCurrentMonth((prev) => (prev - 1 + 12) % 12)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <CalendarIcon className="w-8 h-8" />
          <h1 className="text-3xl font-bold">Birthday Calendar</h1>
        </div>
        <div className="text-center text-muted-foreground">Loading birthdays...</div>
      </div>
    )
  }

  const upcomingBirthdays = getUpcomingBirthdays()

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <CalendarIcon className="w-8 h-8" />
        <h1 className="text-3xl font-bold">Birthday Calendar</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <button
                  onClick={prevMonth}
                  className="p-2 rounded-md hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <CardTitle className="text-2xl">
                  {MONTHS[currentMonth]} {currentYear}
                </CardTitle>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-md hover:bg-accent transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-0 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center font-semibold text-sm py-2 text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar grid */}
              <div className="space-y-0">
                {renderCalendar()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming birthdays */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cake className="w-5 h-5" />
                Upcoming Birthdays
              </CardTitle>
              <CardDescription>Next 5 birthdays</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingBirthdays.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming birthdays</p>
              ) : (
                <div className="space-y-3">
                  {upcomingBirthdays.map((birthday: any) => {
                    const date = new Date(birthday.birthday!)
                    const dateStr = `${MONTHS[date.getMonth()]} ${date.getDate()}`
                    const daysText = birthday.daysUntil === 0 
                      ? 'Today!' 
                      : birthday.daysUntil === 1 
                        ? 'Tomorrow' 
                        : `In ${birthday.daysUntil} days`
                    
                    return (
                      <Link
                        key={birthday.id}
                        to={`/alter/${birthday.id}`}
                        className="block p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{birthday.name}</div>
                            <div className="text-sm text-muted-foreground">{dateStr}</div>
                          </div>
                          <div className={`text-xs font-medium px-2 py-1 rounded ${
                            birthday.daysUntil === 0 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {daysText}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total alters:</span>
                  <span className="font-medium">{birthdays.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">This month:</span>
                  <span className="font-medium">
                    {birthdays.filter(b => {
                      if (!b.birthday) return false
                      const date = new Date(b.birthday)
                      return date.getMonth() === currentMonth
                    }).length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default BirthdayCalendar
