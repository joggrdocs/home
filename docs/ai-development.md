# AI Development Is Changing — And Where It Breaks

When teams start using tools like Claude or Cursor, the initial experience feels incredible.

You can generate code extremely quickly. Features that used to take hours or days to write can now be scaffolded in minutes.

But very quickly, something shifts.

## The Bottleneck Has Moved

The bottleneck is no longer writing code.

Your time moves to two places:
- **Upstream → planning and designing the feature**
- **Downstream → reviewing, validating, and integrating the generated code**

And this is where teams start to run into problems.

Because while tools like Claude and Cursor are great at generating code, they don’t give you a system for handling the parts of the workflow where most of your time now goes—planning and review.

---

## What Actually Breaks as You Scale AI Development

To make AI coding work reliably for real features, you end up building and maintaining a lot of infrastructure:

### Planning & Context (where more time now goes)

- **Work breakdown + context handling**  
  You have to manually break features into steps and continuously decide what code, docs, and prior decisions to pass into each step so the model doesn’t lose context or make incorrect assumptions—this becomes especially painful for long, complex features  

- **Agent Memory**  
  Instruction files only go so far; in practice, you’re constantly having to “train” the model over time (e.g. stop using X, we use Y instead). That means creating docs, updating rules, and modifying instruction files every time new context or decisions emerge. Even when tools offer memory, it’s often user-specific and tied to a single provider, so it doesn’t scale across a team or transfer if you switch tools.  
  As a result, you have no reliable way to maintain and share evolving context—persistent memories, internal docs, codebase knowledge, prior decisions, and external references—without manually managing it all yourself  

---

### Understanding the Codebase

- **Documentation**  
  You have to create and keep architecture and system docs up to date so the model understands how your codebase works  

- **Instruction files (repo-wide + subdirectory-level)**  
  You have to define and maintain how the model behaves across different parts of the repo as things evolve  

- **Coding standards**  
  You have to encode and update how code should be written so outputs stay consistent with your repo  

---

### Execution & Control

- **Configs & settings**  
  You have to configure and continuously adjust permissions, tools, and environments as your setup changes. And importantly, this isn’t just about configuration—sometimes you need to *prevent* the model from doing the wrong thing (e.g. making unsafe commits or taking actions it shouldn’t). That means wiring up enforcement through permissions, hooks, and environment controls, and keeping all of that correctly configured over time  

- **Agent rules**  
  You have to define and maintain rules that enforce how the model writes and behaves across different parts of the repo. In practice, instructions and skills aren’t always enough—the model won’t reliably follow them—so you end up needing mechanisms to *force* correct behavior (via rules, hooks, and constraints). This becomes another layer of infrastructure you have to build and maintain  

- **Agent environments**  
  Once agents move beyond suggesting code and start actually executing work (editing files, running commands, interacting with services), you can’t safely run them directly against your codebase or infrastructure.  
  You’re now giving them real capabilities, but you still can’t fully trust them. That creates both security and control problems, so you need isolated environments to contain their behavior.  
  In practice, this means manually building and maintaining sandboxing, network controls, credential scoping, and audit logging—and keeping all of it working as your stack and team evolve  

---

### Review & Validation (where a huge amount of time now goes)

- **Code quality + validation workflow**  
  You have to run linting, tests, and checks, and spend significant time reviewing and fixing AI-generated code when it doesn’t follow your standards or misses requirements  

- **Code + plan review workflow**  
  You have to review large volumes of generated code and plans locally in your IDE, often across many files.  
  In practice, this turns into constantly jumping between your editor and AI tools, copying and pasting code and context back and forth, and trying to coordinate feedback manually.  
  It’s a fragmented and painful UX that doesn’t scale as the volume of AI-generated work increases  

---

## This Isn’t a One-Time Setup

None of this is a one-time setup—it all has to stay in sync as your codebase evolves.

All of these pieces have to work together across multiple steps without drifting or breaking.

And importantly, this entire system exists because of the shift in where time is spent.

When code generation becomes fast, the coordination layer around planning, context, execution control, and review becomes the real bottleneck—and that’s the part you’re now responsible for building.

---

## Why This Is Hard to Solve with Existing Tools

If you try to do some of this with “skills,” you run into a few real constraints:

- You end up having to build and maintain a large number of them (~50+ for a fully setup repo), just to cover the different parts of this system  
- They behave differently across providers (Claude, Cursor, etc.), so if you build this system yourself, you’re effectively tying it to a specific tool. If a better model or tool comes along, switching means reworking large parts of your setup—or you stay on a suboptimal tool because the cost of switching is too high  
- And some parts of this aren’t solvable with skills at all—you’d have to build custom tooling (e.g. orchestrating multi-step feature development or building a usable code/plan review workflow)  

And this is just for a single repo.

To scale this across a team, you have to replicate and maintain this entire system everywhere. And as the underlying tools change, you have to keep updating how everything works.

---

## What This Actually Becomes

At that point, you’re not just using AI.

You’re building and maintaining an internal system to make AI work reliably in your codebase—especially to handle planning, execution control, and review at scale.

This is infrastructure for AI-driven development—similar to how teams used to stitch together scripts for testing and deployment before tools like GitHub Actions or CircleCI standardized and automated that layer.

---

## Where Joggr Fits

Joggr is that system for AI coding.

It handles the setup, coordination, and ongoing maintenance required to make AI development actually work—especially in the parts of the workflow where your time now goes:
- planning  
- context management  
- execution control  
- review  

Instead of every team building and maintaining this themselves, Joggr provides it out of the box.
