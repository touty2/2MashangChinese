import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { BookOpen, Layers, CheckCircle2, Flame, Target, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAllCards } from "@/lib/flashcardStore";
import { getWordsInDeck, MAIN_DECK_ID, MY_VOCAB_ID } from "@/lib/deckStore";
import { loadStories, type Story } from "@/lib/stories";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Stats {
  totalCards: number;
  dueToday: number;
  newCards: number;
  completedStories: number;
  totalStories: number;
}

export default function Dashboard() {
  const { user, onSyncComplete } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalCards: 0, dueToday: 0, newCards: 0, completedStories: 0, totalStories: 0 });
  const [recentStories, setRecentStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cards, stories, mainDeckWords, myVocabWords] = await Promise.all([
      getAllCards(),
      loadStories(),
      getWordsInDeck(MAIN_DECK_ID),
      getWordsInDeck(MY_VOCAB_ID),
    ]);
    const deckWordSet = new Set([...mainDeckWords, ...myVocabWords]);
    const now = Date.now();
    const dueInDeck = cards.filter((c) => deckWordSet.has(c.word) && c.dueDate <= now);
    const dueWordSet = new Set(dueInDeck.map((c) => c.word));
    const newCards = cards.filter((c) => c.state === 0 && deckWordSet.has(c.word));
    const completed = JSON.parse(localStorage.getItem("mashang_completed") || "[]") as number[];
    setStats({
      totalCards: new Set(cards.filter((c) => deckWordSet.has(c.word)).map((c) => c.word)).size,
      dueToday: dueWordSet.size,
      newCards: new Set(newCards.map((c) => c.word)).size,
      completedStories: completed.length,
      totalStories: stories.length,
    });
    setRecentStories(stories.slice(0, 6));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh whenever a background sync completes — keeps numbers current after tab switch
  useEffect(() => {
    return onSyncComplete(() => { load(); });
  }, [onSyncComplete, load]);

  const greeting = user
    ? `Welcome back, ${user.name || user.email.split("@")[0]}`
    : "Welcome to MaShang Chinese";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {stats.dueToday > 0
            ? `You have ${stats.dueToday} word${stats.dueToday !== 1 ? "s" : ""} due for review today.`
            : "No cards due today — great work!"}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Layers}        label="Words in deck"  value={stats.totalCards}                               color="text-primary" />
        <StatCard icon={Target}        label="Due today"       value={stats.dueToday}                                color="text-amber-500" />
        <StatCard icon={Flame}         label="New words"       value={stats.newCards}                                color="text-rose-500" />
        <StatCard icon={CheckCircle2}  label="Stories read"    value={`${stats.completedStories}/${stats.totalStories}`} color="text-emerald-500" />
      </div>

      <div className="flex flex-wrap gap-3">
        {stats.dueToday > 0 && (
          <Link href="/deck">
            <Button size="lg" className="gap-2">
              <Layers className="w-4 h-4" />
              Review {stats.dueToday} word{stats.dueToday !== 1 ? "s" : ""}
            </Button>
          </Link>
        )}
        <Link href="/sessions">
          <Button variant="outline" size="lg" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Read a story
          </Button>
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">Stories</h2>
          <Link href="/sessions">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              View all <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))
            : recentStories.map((story) => <StoryCard key={story.number} story={story} />)}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, color,
}: {
  icon: React.ElementType; label: string; value: number | string; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("w-4 h-4", color)} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function StoryCard({ story }: { story: Story }) {
  const completed = JSON.parse(localStorage.getItem("mashang_completed") || "[]") as number[];
  const isDone = completed.includes(story.number);
  const bandColor: Record<string, string> = {
    "HSK 3-I": "bg-green-100 text-green-700",
    "HSK 3-II": "bg-green-100 text-green-700",
    "HSK 4-I": "bg-blue-100 text-blue-700",
    "HSK 4-II": "bg-blue-100 text-blue-700",
    "HSK 5-I": "bg-purple-100 text-purple-700",
    "HSK 5-II": "bg-purple-100 text-purple-700",
  };
  return (
    <Link href={`/story/${story.number}`}>
      <Card className={cn("cursor-pointer hover:shadow-md transition-shadow h-full", isDone && "opacity-70")}>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", bandColor[story.hskBand] ?? "bg-muted text-muted-foreground")}>
              {story.hskBand}
            </span>
            {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
          </div>
          <div>
            <p className="font-medium text-sm text-foreground leading-tight">{story.chineseTitle || story.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{story.title}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
