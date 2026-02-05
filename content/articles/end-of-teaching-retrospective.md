+++
date = '2026-01-01T09:30:15+01:00'
draft = false
title = 'End of teaching retrospective'
tags = ['datamatik']
+++

I quit my teacher job.

Unlike most of my teaching blog posts, this entry is not in Danish.

I want to write a retrospective blog post about having been a CS teacher for two years, having been
on paternity leave, and picking up consulting again, but via an agency instead of freelance, which
I had done in the years prior, and not primarily focusing on embedded Rust.

I switched the consulting agency of employment in the last minute before quitting the teacher job.
The story that motivated me to stop teaching is tied to an ambitious project that the old agency is
doing, and since I wasn't going to work there after all, the story I told had to change.

## why u no teach

The real reason is salary. As a teacher I earned about 60% my previous salary. Teaching has been an
amazing job when you have a small baby. I could prepare class in the evening and tend to my child in
the daytime on the days I didn't teach.

The downside is inflexibility towards sickness: When you or your kid is sick, there are still 30+
people expecting you to teach. Any classes you cancel will affect the study plan. I have been lucky
to mostly get sick on weekends and on days of no teaching or meetings.

I look forward to a 7-15 schedule. I get to play with my son during his last wake cycle. My wife is
really looking forward since my evening planning made me absent. But we also know it's going to be
tough, because I don't have random chunks of free time on random weekdays. Just normal office
flexibility.

## What has it been like teaching datamatiker?

Since I hadn't taught CS for several years, I have grown unaccustomed to [overly positive
feedback](https://exercism.org/profiles/sshine/testimonials).

So I'll end the year with a comment from one student:

> I really appreciate how much you do for your students. I am especially thinking of all the guides
> you write and upload. Thank you so much for being a fantastic teacher, I really appreciate it. It
> is not so often I meet a teacher like you!

*(I'm not the only teacher uploading guides.)*

So, what is there to iterate on:

<!--

- teaching in the datamatiker programme
- being a university academic programmer in a business academy
- bringing recent software engineering practices to a culture of teachers who taught for a very long time
- getting formal complaints
- becoming a better teacher
- the four-year process of transitioning from adjunct lecturer to a full lecturer
- making colleagues do your obviously better thing
- dealing with inertia
- getting new bosses
- embracing AI in this timeline, first with Claude Web, then with Claude Code
- contemplating AI policy in teaching CS and as a junior developer
- getting to know in the last minute that my elective course that I planned to teach half a day a week is cancelled for budget reasons

-->

## Teaching in the datamatiker programme

Altogether, teaching datamatiker students has been amazing. The students are interested in real-life
tech skills, and it's easy to connect with them at a human level. The teachers are really nice
people with a lot of diversity, curiosity and teaching experience. I liked every single colleague
that I got to speak with. The working conditions are not stressful, and filled with individual
freedom to teach.

Altogether, teaching datamatiker students has been frustrating. Students never prepare for class,
don't handle deadlines well, and maintaining a 50% attendance at the end of the year is an
achievement. Teachers really like to keep doing what they've been doing forever, and any synergy
throughout the study programme is almost entirely accidental, if not forced by law.

<!--
Towards the end, and following advice from a senior colleague before my paternity leave, I became
another individual contributor without aspirations to improve the study programme beyond immediate,
small-scale improvements to curriculum in the courses I taught.
-->

## Removing the academic barrier to programming...

I started programming as a kid long before I went to university.

So my love of programming comes from a place of discovering things on my own, on my own terms, and
in my own time. I took longer to complete university, too. Going to school to learn things is
stressful, because you're exposed to the standards of others, but that motivation is also what makes
you grow.

On the one hand, I shouldn't impose university standards on business academy students. On the other
hand, I should stress them somewhat to make personal progress. From my past interest in didactics, I
know that exposing your students to higher standards has a positive effect on their learning ([the
Pygmalion effect][pygmalion]). I very gradually built up my expectations from "anything you do will
admit you to the exam" to "I'm asking more of you than most other teachers, because I've seen you
can do it."

[pygmalion]: https://en.wikipedia.org/wiki/Pygmalion_effect

I came from jobs in electrical engineering, embedded software, and cryptography. Shaking that off
and making my students well-rounded full-stack web developers without an obsessive focus on
distributed systems or the particular specialist roles I had been in, took about one semester. The
students liked the themes, but they justifiably worried if it'd benefit their careers short-term.

### ...except for functional programming

The one academic subject I didn't let go of was functional programming.

I am a functional programmer by education and at heart. Functional programming principles are not
nearly as widespread as it would do mankind good. And here I am in a room of people who have only
been misguided by object-oriented dogmatists for two to three semesters, an arguably small part of
their professional existence.

Functional programming gets treated by other datamatiker teachers for a few hours, learning `map()`,
`filter()` and `reduce()`. I like that approach. But list combinators are of course just a gateway
to functional programming principles.

There is a real opportunity to teach students how to not constantly fuck up their code and everyone
else's by imposing mutable state everywhere, and by neglecting the type system in modern languages.
Generics were introduced to Java in 2004; I remember in 2008 they were still considered new. We only
use them when the library magicians expose them, but inheritance? No problemo, car extends bicycle!

I taught functional programming to the extent possible; for example,

- [Java Persistence API (JPA)][jpa] was already a part of the curriculum, and provides a declarative
interface to databases, and automated code derication based on types and function names.
- Using [Java records][java-records] to express [Data Transfer Objects][java-dto]
- Making functions testable by removing side-effects

Learning full-stack web development CRUD, it seems that event handlers are always super lightweight,
so there weren't really a lot of places to code imperatively anyway. Teaching functional programming
to datamatiker students was entirely unproblematic to the extent that they're CRUD developers.

[jpa]: https://spring.io/projects/spring-data-jpa
[java-records]: https://www.baeldung.com/java-record-keyword
[java-dto]: https://www.baeldung.com/java-dto-pattern

Realizing how outnumbered I was among teachers, I tried to break some barriers with joke blog posts like:

{{< articlelink href="/articles/rekursivt-beruset-med-monoider/" title="Om at blive rekursivt beruset med monoider" date="Apr 13, 2025 " >}}
{{< articlelink href="/articles/design-patterns-popkultur/" title="Design Patterns i popkultur" date="Sep 4, 2025 " >}}
{{< articlelink href="/articles/funktionel-datamodellering/" title="Funktionel datamodellering" date="Jan 1, 2026" >}}

Most of the time I'm in a parallel universe where functional programming is the obvious better
choice, and where object-oriented programming has reached its end: Clearly it was a dud that
delivered nothing more than [Structured Programming][strprog], except great sales pitches in the
1980s.

[strprog]: https://en.wikipedia.org/wiki/Structured_programming

## Software engineering practices among teachers

Teachers are life-long learners. But somehow most of them don't learn modern software engineering
practices. (The provocative part of the sentence is "modern" because I get to define what's modern.)
This sounds crude, but my best example was when I held a git workshop for teachers early in my
tenure, and I created this case where students were stuck having accidentally commited a 700MB file
and now needed help getting unstuck so they could push to their repository again, since deleting the
file didn't remove it from history.

Upon setting up the scenario, I get a question from an otherwise brilliant teacher who is not afraid
to ask the question that others don't dare:

> Sorry, what does `git add` do?

Of [all the things you can learn about git][git-roadmap], we haven't even
established the basics.

[git-roadmap]: https://roadmap.sh/git-github

As with any learning on the job, it takes a lot of time. If you have been teaching for 5, 10, or 25
years, and you haven't dedicated most of your day to new technology, then you might still be coding
Java like it's 2006.

The teachers on later semesters are exposed to more changing curriculum and technology. Basic
control flow hasn't changed much since forever. At university, teachers can hide their technofobia
behind the fact that the essence of computing is timeless. Well, Docker isn't. It's a crude tool
with pointy ends.

After returning from my paternity leave, I taught elective courses in algorithms and programming in
C, so I didn't try to deal with software engineering and simply taught better tooling and
introductory DevOps in the 3rd semester technology course.

I don't know how much time there really is for software engineering.

## Getting formal complaints

An anecdote: A colleague of mine got a formal complaint from one of their students because he taught
too much programming in the systems development class. Somehow the student felt that this was
inappropriate allocation of time. I found that hilarious and vowed to achieve a formal complaint for
teaching too much programming. I only got complaints from other teachers, unfortunately.

## Becoming a better teacher

When I studied Computer Science at DIKU, I was a teaching assistant for a long period of time. I
took courses in didactics at [IND][ind], I enjoyed tinkering with learning material, and I got a lot
of positive feedback for my engagement.

Eventually the university decided that they should probably teach teaching assistants how to teach.
This was mostly a disaster, since the people teaching us were not scientists, had no experience
teaching Computer Science or computer programming, or were even good at didactics. As a contrast,
I still know a lot about Komodo dragons 15 years later because the IND didactics teachers were so
immersive, and their teaching examples happened to be from biology.

[ind]: https://www.ind.ku.dk/

EK has a similar mandatory onboarding process where they teach you about the fundamentals of
teaching at EK, but also seek to educate you on your didactics. I believe they have a stronger
foundation for teaching didactics at EK, but it's a generic course, doesn't target programming
specifically, and doesn't factor in your previous experience.

I have come to believe that any school of a sufficient size must have a slightly disappointing,
mandatory didactics course. Just like they need a data protection officer, a design system, and a
party planning committee. Organizations of a certain size are socially obligated to keep a certain
amount of people busy with this kind of work.

It's funny how you can have a school full of experienced teachers with PhDs, sometimes even within
didactics, decades of teaching experience, and strong opinions on what didactic methods work at this
educational level based on real experience. Yet they're not leading the mandatory didactics courses.

## The four-year process of transitioning from adjunct lecturer to a full lecturer

The purpose of mandatory didactics class is to prepare the transition from being an Adjunct Lecturer
to a full Lecturer via the formal Lecturer Application. When I started teaching at the business
academy level, I thought that four years is probably a short time when you have a kid. As it became
more clear that I would not stay here for four years, I became less patient with the process and
started opting out of the mandatory classes. It turns out they're only mandatory if you want to stay
employed for longer than four years.

Does the Lecturer Application process make sense?

On the one hand, striving to improve your teaching probably makes your teaching better. On the other
hand, I wouldn't be able to tell if any given teacher had been employed for shorter or longer than
four years, based on the quality of their teaching. As far as I can see, everyone's teaching is more
or less exactly the same before and after submitting their Lecturer Application. They're the same
people.

One colleague who has been a lecturer for 20 years still had to go through this process.

## Collaborating with other teachers

As a teacher you're most often in a class team with 1-2 other teachers and in a semester team with
3-4 total teachers. I took part in the 3rd semester teams. There was a quite high agreement on what
programming and technology to teach. The collaboration with the systems development class was mostly
non-existent; sometimes students would know all about [GitFlow][gitflow] (which I dislike, but I
appreciate how it makes students work hard with git), and at other times I'm not sure if they were
learning anything practical at all.

[gitflow]: https://www.endoflineblog.com/gitflow-considered-harmful

EK has this idea that programming should be taught by former programmers, and systems development
should be taught by former project managers. Most project managers are former programmers, some are
not, the methods vary wildly. As a software developer who mostly didn't do project management, I've
got my own takes on systems development, and I vowed to work on making programming class play more
into what's taught here.

Improving the 3rd semester collaboration even further is something I will miss greatly.

Improving on the transition from the 2nd semester seemed a little futile without having taught
there.

## Dealing with inertia

For most of my employment there was an ongoing effort to streamline the educational programme. For
each class taught there should be a set of documents describing the goals, and 2-4 times a year
teachers should sit together and evaluate and refine these documents. This makes sure the transition
between semesters goes as planned, that classes on the same semester learn approximately the same
things, and makes onboarding teachers on new semesters easier.

I really liked this idea and volunteered a lot for these committees.

Witnessing the unwillingness to maintain or cooperate on these documents made me let go of this
effort. They were not mandatory, and they were occasionally placed on days where I had exams, so as
a coordinator I couldn't go. This made letting go easier.

I don't see any other way around having this type of collaboration. Had I known I'd stay at the
school for a long time, I'd have muscled through. For my last semester I had elective courses where
the need for these documents is less, since there's no subsequent semester to prepare for.

## Embracing AI / assessing AI in learning environments

I started using AI in mid-2023 as I had a contract that motivated me to learn about NixOS. I use
[Kagi](https://kagi.com), the AI-powered search engine, which provided access to Anthropic's
[Claude](https://claude.ai) using their AI agent that supported searching the web half a year before
the AI frontier labs. This was when "AI is hallucinating" was big: Just ask it to use a search
engine, and provide references!

I switched to Claude's free tier in April 2024. I bought $25 worth of API tokens in July 2024
because I wanted to experiment. But I never touched them until they were about to expire a year
later. I hooked them into Claude Code and spent them in two days. I got a subscription instantly,
and I've been hooked since.

My personal motivation was to speed up learning, not productivity.

Encountering AI use among students, it seemed to mostly enable them to pass programming tasks.

They copy-paste a lot from ChatGPT.

They use IntelliJ's AI-powered auto-complete.

And they don't experiment much with other models or agentic interfaces.

On the one hand, I saw several mandatory solutions made almost entirely with ChatGPT. On the other
hand, teaching [low level C][llc], I saw several students copy-paste code into ChatGPT and ask it to
explain the concepts. They did so openly because I said I was an AI maximalist, and that I wanted
them to find out how to use it as much as possible.

There's a lot to be said about AI in teaching, and I would have loved to pontificate more about it.

If I can say two things:

1. Students seeking high productivity only succeed because we reward them for doing things that were
   previously hard and highly correlated with learning. Now it's easy and not correlated with
   learning. We reward them for productivity because pre-AI it wasn't possible to be a productive
   programmer without having learned programming.
2. Oral exams with live-coding reveal what students can and cannot do with/without AI.

Agentic programming still costs money, so most teachers and students don't use it yet.

[llc]: https://katalog.kea.dk/course/3050456/2025-2026

## Kubernetes course cancelled

To my big disappointment and relief, [my Kubernetes course was cancelled][k8s-cancelled].

[k8s-cancelled]: /articles/kubernetes-valgfag/

## Conclusion

I'm starting work as an AI consultant with some DevOps responsibilities.

AI wasn't that big when I was most recently a full-time developer.

So not only do I get to fully embrace the tools. I get to further develop them with like-minded
colleagues.

I'm not done teaching in my life. But I don't imagine returning any time soon.
