# College Study Notes

A private study-notes library for multiple explicitly configured admins, built with React, TypeScript, Vite, Tailwind CSS, React Router, and Supabase. It starts empty. Public visitors can only view a page reached through an active, unexpired share link.

## Requirements

- Node.js 20 or newer and npm
- A Supabase project
- A modern browser; Chrome or Edge is recommended for speech recognition

## Supabase setup

1. Create a Supabase project and open **Project Settings → API**. Keep the project URL and **anon/public** key for the frontend. Never put the service-role key in a `VITE_` variable or in frontend code.
2. Open **SQL Editor**, paste in [`supabase/schema.sql`](./supabase/schema.sql), and run it once. This creates the empty notes tables, multi-admin RLS policies, the private `question-images` bucket, and the share-content RPC. If the original single-admin schema is already installed, run [`supabase/migrations/20261008_multi_admin.sql`](./supabase/migrations/20261008_multi_admin.sql) instead; do not rerun the full schema.
3. In **Authentication → Users**, create the email/password account for each person who should administer the library. Do not build or enable an app signup flow. In **Authentication → Settings**, disable **Allow new users to sign up**.
4. In SQL Editor, add each authorized existing user as an admin. Run this statement once per account, changing the email:

   ```sql
   insert into public.admin_config (user_id)
   select id from auth.users where email = 'owner@example.com'
   on conflict (user_id) do nothing;
   ```

   Repeat with the second admin's email. Confirm each email matches a user in Supabase Auth. Only a Supabase project owner/database administrator should add or remove admins; never expose admin provisioning through public signup.
5. Under **Authentication → URL Configuration**, set the local redirect URL to `http://localhost:5173/**` and add your deployed Vercel URL when available.

## Run locally

From the project folder:

```powershell
npm install
Copy-Item .env.example .env.local
```

If you are using **Command Prompt** (`cmd.exe`) instead of PowerShell, use:

```cmd
npm install
copy .env.example .env.local
notepad .env.local
```

Edit `.env.local` and provide the Supabase **Project URL** and **anon/public key**:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Start the app:

```powershell
npm run dev
```

Open the local URL shown by Vite (normally `http://localhost:5173`) and sign in with an admin account created in Supabase. There is no signup page. The browser checks the authenticated user against `admin_config`, and database RLS independently protects all private data.

To verify a deploy build:

```powershell
npm run build
npm run preview
```

## Private image sharing

Admin uploads use authenticated access to the private `question-images` bucket. Shared pages do not expose the bucket or service-role key. For inline images in shared pages, deploy the narrowly scoped Edge Function that validates the share token, confirms that the requested image belongs to that link's returned content, and signs that one object for five minutes.

Install the Supabase CLI if needed, then from the project folder:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy shared-image --no-verify-jwt
```

The function uses Supabase's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side environment variables. `--no-verify-jwt` is required because the shared page is anonymous; the function itself validates the high-entropy share token and limits signing to images present in that share's scoped RPC response. Do not expose the service-role key to the browser.

## Deploy to Vercel

1. Import this repository in Vercel and keep the project root as the Vite app root.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Project → Settings → Environment Variables** for each environment you deploy.
3. Deploy. The included [`vercel.json`](./vercel.json) rewrites browser routes to the SPA entry point.
4. Add the deployed URL to Supabase's allowed redirect URLs. Redeploy after changing Vite environment variables.
5. Deploy the `shared-image` Edge Function as described above if shared pages need to display private uploaded images.

## Using the app

- Browse semester and subject names from the clean home, then browse chapters, questions, and answers on a subject page.
- Use **Manage** in the top bar for the separate editing workspace: add and rename semesters and subjects, and add, rename, delete, or reorder chapters and questions. Each new chapter has Very Short, Short, and Long sections ready to use.
- Add questions and answers with the formatting toolbar, links, code blocks, and uploaded images. Images can also be pasted or dropped into the editor.
- Use the microphone controls for Bangla (`bn-BD`), English (`en-US`), or Mixed (defaults to Bangla). The UI uses a replaceable provider interface in `src/lib/speechProvider.ts`; browser support and microphone permission are required.
- Share a semester, subject, chapter, or question. Optional expiry is enforced by the RPC, and active links can be copied or revoked under **Shared links**.
- Search matches across stored question text and answer HTML. Rich HTML is sanitized before it is rendered.

## Security boundaries

- The frontend contains only the Supabase anon key; RLS is the actual private-data boundary.
- The database has no public read policy for notes, share-link rows, or image objects. Only users explicitly listed in `admin_config` can access them directly.
- Anonymous share reads go through `get_shared_content(token)`, which returns only the requested scope and its descendants. Invalid, revoked, expired, or deleted-item links return no content.
- Shared images are signed only after the Edge Function verifies both the active token and exact image path. Signed URLs expire after five minutes.
- Deleting a content item automatically deactivates share links directly scoped to that item. Deleting any parent cascades through its descendants.
