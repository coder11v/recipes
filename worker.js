export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            });
        }

        const url = new URL(request.url);
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        try {
            if (request.method === 'GET' && url.pathname === '/recipes') {
                return handleGetRecipes(env, corsHeaders);
            }

            if (request.method === 'GET' && url.pathname.startsWith('/recipes/') && !url.pathname.endsWith('/pdf')) {
                const id = url.pathname.split('/')[2];
                return handleGetRecipe(env, id, corsHeaders);
            }

            if (request.method === 'POST' && url.pathname === '/recipes') {
                return handleAddRecipe(request, env, corsHeaders);
            }

            if (request.method === 'PUT' && url.pathname.startsWith('/recipes/')) {
                const id = url.pathname.split('/')[2];
                return handleUpdateRecipe(request, env, id, corsHeaders);
            }

            if (request.method === 'DELETE' && url.pathname.startsWith('/recipes/')) {
                const id = url.pathname.split('/')[2];
                return handleDeleteRecipe(env, id, corsHeaders);
            }

            if (request.method === 'GET' && url.pathname.endsWith('/pdf')) {
                const id = url.pathname.split('/')[2];
                return handleGetRecipePDF(env, id, corsHeaders);
            }

            if (request.method === 'GET' && url.pathname === '/search') {
                const q = url.searchParams.get('q') || '';
                const category = url.searchParams.get('category') || '';
                return handleSearchRecipes(env, q, category, corsHeaders);
            }

            // AUTH Endpoints
            if (request.method === 'POST' && url.pathname === '/auth/login') {
                return handleAuthLogin(request, env, corsHeaders);
            }
            if (request.method === 'POST' && url.pathname === '/auth/signup') {
                return handleAuthSignup(request, env, corsHeaders);
            }
            if (request.method === 'POST' && url.pathname === '/auth/google') {
                return handleAuthGoogle(request, env, corsHeaders);
            }
            if (request.method === 'GET' && url.pathname === '/auth/config') {
                return handleAuthConfig(env, corsHeaders);
            }
            if (request.method === 'POST' && url.pathname === '/convert-pdf') {
                return handleConvertPDF(request, env, corsHeaders);
            }

            return new Response('Not found', { status: 404, headers: corsHeaders });

        } catch (err) {
            console.error('Worker error:', err);
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

/* -------------------- HELPERS -------------------- */

const str = v => ({ stringValue: String(v ?? '') });
const int = v => ({ integerValue: String(parseInt(v) || 0) });
const arr = a => ({
    arrayValue: { values: Array.isArray(a) ? a.map(v => str(v)) : [] }
});

/* -------------------- GET ALL -------------------- */

async function handleGetRecipes(env, corsHeaders) {
    const { projectId, apiKey } = JSON.parse(env.FIREBASE_CONFIG);

    const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/recipes?key=${apiKey}&pageSize=100`
    );

    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    const recipes = (data.documents || []).map(parseRecipeDocument);

    recipes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return json(recipes, corsHeaders);
}

/* -------------------- GET ONE -------------------- */

async function handleGetRecipe(env, id, corsHeaders) {
    const { projectId, apiKey } = JSON.parse(env.FIREBASE_CONFIG);

    const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/recipes/${id}?key=${apiKey}`
    );

    if (!res.ok) return json({ error: 'Not found' }, corsHeaders, 404);

    return json(parseRecipeDocument(await res.json()), corsHeaders);
}

/* -------------------- POST -------------------- */

async function handleAddRecipe(request, env, corsHeaders) {
    const body = await request.json();
    const { projectId, apiKey } = JSON.parse(env.FIREBASE_CONFIG);
    const now = new Date().toISOString();

    const doc = {
        fields: {
            title: str(body.title),
            description: str(body.description),
            ingredients: arr(body.ingredients),
            directions: arr(body.directions),
            category: str(body.category || 'Uncategorized'),
            cuisine: str(body.cuisine),
            prepTime: int(body.prepTime),
            cookTime: int(body.cookTime),
            servings: int(body.servings),
            difficulty: str(body.difficulty || 'Medium'),
            tags: arr(body.tags),
            imageUrl: str(body.imageUrl),
            notes: str(body.notes),
            source: str(body.source),
            pdfUrl: str(body.pdfUrl),
            uid: str(body.uid), // Added uid
            isPublic: { booleanValue: !!body.isPublic }, // Added isPublic
            author: str(body.author), // Added author name
            sharedWith: arr(body.sharedWith), // Added sharedWith emails
            createdAt: { timestampValue: now },
            updatedAt: { timestampValue: now }
        }
    };

    const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/recipes?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) }
    );

    if (!res.ok) throw new Error(await res.text());

    return json(parseRecipeDocument(await res.json()), corsHeaders, 201);
}

/* -------------------- PUT -------------------- */

async function handleUpdateRecipe(request, env, id, corsHeaders) {
    const body = await request.json();
    const { projectId, apiKey } = JSON.parse(env.FIREBASE_CONFIG);

    const fields = {};
    const mask = [];
    const now = new Date().toISOString();

    const set = (k, v) => { fields[k] = v; mask.push(k); };

    if ('title' in body) set('title', str(body.title));
    if ('description' in body) set('description', str(body.description));
    if ('ingredients' in body) set('ingredients', arr(body.ingredients));
    if ('directions' in body) set('directions', arr(body.directions));
    if ('category' in body) set('category', str(body.category));
    if ('cuisine' in body) set('cuisine', str(body.cuisine));
    if ('prepTime' in body) set('prepTime', int(body.prepTime));
    if ('cookTime' in body) set('cookTime', int(body.cookTime));
    if ('servings' in body) set('servings', int(body.servings));
    if ('difficulty' in body) set('difficulty', str(body.difficulty));
    if ('tags' in body) set('tags', arr(body.tags));
    if ('imageUrl' in body) set('imageUrl', str(body.imageUrl));
    if ('pdfUrl' in body) set('pdfUrl', str(body.pdfUrl));
    if ('notes' in body) set('notes', str(body.notes));
    if ('source' in body) set('source', str(body.source));
    if ('isPublic' in body) set('isPublic', { booleanValue: !!body.isPublic });
    if ('author' in body) set('author', str(body.author));
    if ('sharedWith' in body) set('sharedWith', arr(body.sharedWith));

    set('updatedAt', { timestampValue: now });

    const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/recipes/${id}?key=${apiKey}&updateMask.fieldPaths=${mask.join('&updateMask.fieldPaths=')}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }
    );

    if (!res.ok) throw new Error(await res.text());

    return json(parseRecipeDocument(await res.json()), corsHeaders);
}

/* -------------------- DELETE -------------------- */

async function handleDeleteRecipe(env, id, corsHeaders) {
    const { projectId, apiKey } = JSON.parse(env.FIREBASE_CONFIG);

    const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/recipes/${id}?key=${apiKey}`,
        { method: 'DELETE' }
    );

    if (!res.ok) throw new Error(await res.text());

    return json({ success: true, id }, corsHeaders);
}

/* -------------------- SEARCH -------------------- */

async function handleSearchRecipes(env, q, category, corsHeaders) {
    const list = await handleGetRecipes(env, corsHeaders);
    let recipes = await list.json();

    if (q) {
        q = q.toLowerCase();
        recipes = recipes.filter(r =>
            r.title.toLowerCase().includes(q) ||
            r.ingredients.some(i => i.toLowerCase().includes(q))
        );
    }

    if (category) {
        recipes = recipes.filter(r => r.category === category);
    }

    return json(recipes, corsHeaders);
}

/* -------------------- AUTH -------------------- */

async function handleAuthConfig(env, corsHeaders) {
    const config = JSON.parse(env.FIREBASE_CONFIG);
    return json({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId
    }, corsHeaders);
}

async function handleAuthLogin(request, env, corsHeaders) {
    const { email, password } = await request.json();
    const { apiKey } = JSON.parse(env.FIREBASE_CONFIG);

    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        }
    );

    const data = await res.json();
    if (!res.ok) return json(data, corsHeaders, res.status);
    return json(data, corsHeaders);
}

async function handleAuthSignup(request, env, corsHeaders) {
    const { email, password, displayName } = await request.json();
    const { apiKey } = JSON.parse(env.FIREBASE_CONFIG);

    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        }
    );

    const data = await res.json();
    if (!res.ok) return json(data, corsHeaders, res.status);

    // If displayName provided, update profile
    if (displayName) {
        await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: data.idToken, displayName, returnSecureToken: true })
            }
        );
    }

    return json(data, corsHeaders);
}

async function handleAuthGoogle(request, env, corsHeaders) {
    const { idToken } = await request.json();
    const { apiKey } = JSON.parse(env.FIREBASE_CONFIG);

    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                postBody: `id_token=${idToken}&providerId=google.com`,
                requestUri: 'http://localhost',
                returnIdpCredential: true,
                returnSecureToken: true 
            })
        }
    );

    const data = await res.json();
    if (!res.ok) return json(data, corsHeaders, res.status);
    return json(data, corsHeaders);
}

/* -------------------- PDF DATA -------------------- */

async function handleGetRecipePDF(env, id, corsHeaders) {
    return handleGetRecipe(env, id, corsHeaders);
}

/* -------------------- PDF CONVERSION -------------------- */

async function handleConvertPDF(request, env, corsHeaders) {
    try {
        // Check if GEMINI_API_KEY is configured
        if (!env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not configured in environment variables');
        }

        // Parse the multipart form data
        const formData = await request.formData();
        const pdfFile = formData.get('pdf');

        if (!pdfFile) {
            throw new Error('No PDF file provided');
        }

        // Convert PDF to base64
        const arrayBuffer = await pdfFile.arrayBuffer();
        const base64Data = arrayBufferToBase64(arrayBuffer);

        // Call Gemini API with the PDF
        const recipe = await analyzePDFWithGemini(base64Data, env.GEMINI_API_KEY);

        return json(recipe, corsHeaders);

    } catch (err) {
        console.error('PDF conversion error:', err);
        return json({
            error: 'Failed to convert PDF',
            details: err.message
        }, corsHeaders, 500);
    }
}

async function analyzePDFWithGemini(base64PDF, apiKey) {
    const prompt = `You are a recipe extraction expert. Analyze this PDF document and extract the recipe information.

Return a JSON object with the following structure (use null for any fields not found):
{
  "title": "Recipe name",
  "description": "Brief description",
  "category": "One of: Breakfast, Lunch, Dinner, Dessert, Appetizer, Beverage, Snack",
  "cuisine": "Type of cuisine (e.g., Italian, Mexican, etc.)",
  "prepTime": number (in minutes),
  "cookTime": number (in minutes),
  "servings": number,
  "difficulty": "One of: Easy, Medium, Hard",
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "directions": ["step 1", "step 2", ...],
  "tags": ["tag1", "tag2", ...],
  "notes": "Any additional notes or tips",
  "source": "Source of the recipe if mentioned"
}

Important:
- Extract ALL ingredients with their measurements
- Extract ALL directions/steps in order
- If prep time or cook time are ranges (e.g., "10-15 minutes"), use the average
- Be thorough and accurate
- If a field is not found in the PDF, use null or empty array as appropriate
- Return ONLY valid JSON, no additional text`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: 'application/pdf',
                                data: base64PDF
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.2,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                }
            })
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response from Gemini API');
    }

    const text = data.candidates[0].content.parts[0].text;

    // Extract JSON from the response (in case there's markdown formatting)
    let jsonText = text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    try {
        const recipe = JSON.parse(jsonText);

        // Ensure arrays are arrays and clean up null values
        return {
            title: recipe.title || 'Untitled Recipe',
            description: recipe.description || '',
            category: recipe.category || 'Uncategorized',
            cuisine: recipe.cuisine || '',
            prepTime: recipe.prepTime || null,
            cookTime: recipe.cookTime || null,
            servings: recipe.servings || null,
            difficulty: recipe.difficulty || 'Medium',
            ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
            directions: Array.isArray(recipe.directions) ? recipe.directions : [],
            tags: Array.isArray(recipe.tags) ? recipe.tags : [],
            notes: recipe.notes || '',
            source: recipe.source || ''
        };
    } catch (parseError) {
        console.error('Failed to parse JSON from Gemini:', jsonText);
        throw new Error('Failed to parse recipe data from PDF');
    }
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/* -------------------- UTIL -------------------- */

function json(data, headers, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
    });
}

function parseRecipeDocument(doc) {
    const f = doc.fields || {};
    return {
        id: doc.name.split('/').pop(),
        title: f.title?.stringValue || '',
        description: f.description?.stringValue || '',
        ingredients: f.ingredients?.arrayValue?.values?.map(v => v.stringValue) || [],
        directions: f.directions?.arrayValue?.values?.map(v => v.stringValue) || [],
        category: f.category?.stringValue || 'Uncategorized',
        cuisine: f.cuisine?.stringValue || '',
        prepTime: parseInt(f.prepTime?.integerValue || 0),
        cookTime: parseInt(f.cookTime?.integerValue || 0),
        servings: parseInt(f.servings?.integerValue || 0),
        difficulty: f.difficulty?.stringValue || 'Medium',
        tags: f.tags?.arrayValue?.values?.map(v => v.stringValue) || [],
        imageUrl: f.imageUrl?.stringValue || '',
        notes: f.notes?.stringValue || '',
        source: f.source?.stringValue || '',
        pdfUrl: f.pdfUrl?.stringValue || '',
        uid: f.uid?.stringValue || '',
        isPublic: f.isPublic?.booleanValue ?? true,
        author: f.author?.stringValue || 'dbajaj3@gmail.com',
        sharedWith: f.sharedWith?.arrayValue?.values?.map(v => v.stringValue) || [],
        createdAt: f.createdAt?.timestampValue,
        updatedAt: f.updatedAt?.timestampValue
    };
}